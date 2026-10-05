import type { PrismaClient } from "@prisma/client";
import { deleteAttachmentAndReclaim } from "./storage.js";
import { abandonedFileIds, fileNameOfStoragePath, uploadedFileNames } from "./studyFileRules.js";

export interface FileOps {
  db: PrismaClient;
  /** Defaults to the real helper (removes the disk file and DB row, and gives the quota back). Injectable for tests. */
  deleteAttachment?: (attachmentId: number) => Promise<void>;
  now?: () => Date;
  warn?: (details: object, message: string) => void;
}

const remove = (ops: FileOps) => ops.deleteAttachment ?? deleteAttachmentAndReclaim;

/** Files the study's current text and notes still use. */
async function liveFileNames(db: PrismaClient, studyId: number): Promise<Set<string>> {
  const study = await db.study.findUnique({ where: { id: studyId }, select: { body: true, annotations: { select: { text: true } } } });
  const live = new Set<string>();
  if (!study) return live;
  for (const n of uploadedFileNames(study.body)) live.add(n);
  for (const a of study.annotations) for (const n of uploadedFileNames(a.text)) live.add(n);
  return live;
}

/** A file someone else's study also points at (e.g. a pasted link) must survive this study's cleanup. */
async function usedByAnotherStudy(db: PrismaClient, studyId: number, name: string): Promise<boolean> {
  const inBody = await db.study.findFirst({ where: { id: { not: studyId }, body: { contains: name } }, select: { id: true } });
  if (inBody) return true;
  const inNote = await db.studyAnnotation.findFirst({ where: { studyId: { not: studyId }, text: { contains: name } }, select: { id: true } });
  return !!inNote;
}

async function safely(ops: FileOps, id: number, context: string): Promise<boolean> {
  try {
    await remove(ops)(id);
    return true;
  } catch (err) {
    ops.warn?.({ err, attachmentId: id }, `study file cleanup failed (${context})`); // cleanup is best-effort: never fail the user's action over it
    return false;
  }
}

/**
 * Deletes this study's uploaded files named in `candidates` - unless the study's current text or notes
 * still reference them, or another study does. Called when something that referenced a file goes away
 * (a note deleted or edited, a block removed from the text). Returns how many files were deleted.
 */
export async function releaseStudyFiles(ops: FileOps, studyId: number, candidates: Iterable<string>): Promise<number> {
  const names = [...new Set(candidates)];
  if (names.length === 0) return 0;
  const live = await liveFileNames(ops.db, studyId);
  let removed = 0;
  for (const name of names) {
    if (live.has(name)) continue;
    const attachment = await ops.db.attachment.findFirst({ where: { studyId, storagePath: `/uploads/messages/${name}` }, select: { id: true } });
    if (!attachment) continue; // not this study's file - leave it alone
    if (await usedByAnotherStudy(ops.db, studyId, name)) continue;
    if (await safely(ops, attachment.id, "release")) removed++;
  }
  return removed;
}

/** Deletes uploads that never made it into the study and are past the grace period. */
export async function sweepAbandonedStudyFiles(ops: FileOps, studyId: number): Promise<number> {
  const files = await ops.db.attachment.findMany({ where: { studyId }, select: { id: true, storagePath: true, createdAt: true } });
  if (files.length === 0) return 0;
  const live = await liveFileNames(ops.db, studyId);
  let removed = 0;
  for (const id of abandonedFileIds(files, live, ops.now?.() ?? new Date())) {
    if (await safely(ops, id, "abandoned upload")) removed++;
  }
  return removed;
}

/** Everything the study uploaded, for when the study itself is deleted. Files another study also uses are kept. */
export async function deleteAllStudyFiles(ops: FileOps, studyId: number): Promise<number> {
  const files = await ops.db.attachment.findMany({ where: { studyId }, select: { id: true, storagePath: true } });
  let removed = 0;
  for (const f of files) {
    const name = fileNameOfStoragePath(f.storagePath);
    if (name !== null && (await usedByAnotherStudy(ops.db, studyId, name))) continue;
    if (await safely(ops, f.id, "study deleted")) removed++;
  }
  return removed;
}
