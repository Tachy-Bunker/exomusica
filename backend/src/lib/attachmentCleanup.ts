import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { deleteAttachmentAndReclaim } from "./storage.js";
import { isLocalPath, orphanFileNames, reclaimReason, type AttachmentFacts, type ReclaimReason } from "./attachmentRules.js";

type Deleter = (attachmentId: number) => Promise<void>;

/** What an attachment's "is anything using it?" facts need loading from the database. */
export const FACTS_SELECT = {
  createdAt: true,
  privateMessageId: true,
  studyId: true,
  message: { select: { isDeleted: true } },
  communityTrack: { select: { id: true } },
  sampleBankItem: { select: { id: true } },
  communityAlbumCover: { select: { id: true } },
  branchPreviewFor: { select: { id: true } },
  branchSketchFor: { select: { id: true } },
} as const;

export function factsOf(a: {
  createdAt: Date;
  privateMessageId: number | null;
  studyId: number | null;
  message: { isDeleted: boolean } | null;
  communityTrack: unknown;
  sampleBankItem: unknown;
  communityAlbumCover: unknown;
  branchPreviewFor: unknown;
  branchSketchFor: unknown;
}): AttachmentFacts {
  return {
    createdAt: a.createdAt,
    message: a.message ? { isDeleted: a.message.isDeleted } : null,
    hasPrivateMessage: a.privateMessageId !== null,
    usedElsewhere: !!(a.communityTrack || a.sampleBankItem || a.communityAlbumCover || a.branchPreviewFor || a.branchSketchFor),
    studyId: a.studyId,
  };
}

/**
 * A chat message was deleted: delete its attachments too (file, row, and the uploader's quota) -
 * except any that something else still uses, e.g. one curated as a branch sketch.
 */
export async function deleteMessageAttachments(db: PrismaClient, messageId: number, deleteAttachment: Deleter = deleteAttachmentAndReclaim): Promise<number> {
  const rows = await db.attachment.findMany({ where: { messageId }, select: { id: true, ...FACTS_SELECT } });
  let removed = 0;
  for (const r of rows) {
    const f = factsOf(r);
    if (f.usedElsewhere || f.studyId !== null || f.hasPrivateMessage) continue;
    try {
      await deleteAttachment(r.id);
      removed++;
    } catch {
      // housekeeping only - the message is deleted either way
    }
  }
  return removed;
}

export interface ReclaimItem {
  id: number;
  filename: string;
  sizeBytes: string;
  uploader: string;
  reason: ReclaimReason;
  /** Already moved to archive.org: only the database row (and quota) can be cleaned up, not the remote file. */
  external: boolean;
}
export interface ReclaimReport {
  items: ReclaimItem[];
  orphanFiles: { name: string; sizeBytes: number }[];
  totals: { deletedMessage: number; neverPosted: number; orphanFiles: number; bytes: string };
}

/** Everything that is clutter right now. Pure read - nothing is changed. */
export async function findReclaimable(db: PrismaClient, uploadsDir: string, now = new Date()): Promise<ReclaimReport> {
  const all = await db.attachment.findMany({ select: { id: true, filename: true, sizeBytes: true, storagePath: true, uploader: { select: { username: true } }, ...FACTS_SELECT } });
  const items: ReclaimItem[] = [];
  let bytes = 0n;
  for (const a of all) {
    const reason = reclaimReason(factsOf(a), now);
    if (!reason) continue;
    items.push({ id: a.id, filename: a.filename, sizeBytes: a.sizeBytes.toString(), uploader: a.uploader.username, reason, external: !isLocalPath(a.storagePath) });
    bytes += a.sizeBytes;
  }

  const known = new Set<string>();
  for (const a of all) if (isLocalPath(a.storagePath)) known.add(path.basename(a.storagePath));
  const dir = path.join(uploadsDir, "messages");
  let entries: { name: string; mtimeMs: number; size: number }[] = [];
  try {
    entries = await Promise.all(
      (await readdir(dir)).map(async (name) => {
        const s = await stat(path.join(dir, name));
        return s.isFile() ? { name, mtimeMs: s.mtimeMs, size: s.size } : null;
      }),
    ).then((list) => list.filter((e): e is { name: string; mtimeMs: number; size: number } => e !== null));
  } catch {
    // no uploads folder yet - nothing to scan
  }
  const orphanNames = new Set(orphanFileNames(entries, known, now));
  const orphanFiles = entries.filter((e) => orphanNames.has(e.name)).map((e) => ({ name: e.name, sizeBytes: e.size }));
  for (const o of orphanFiles) bytes += BigInt(o.sizeBytes);

  return {
    items,
    orphanFiles,
    totals: {
      deletedMessage: items.filter((i) => i.reason === "deleted-message").length,
      neverPosted: items.filter((i) => i.reason === "never-posted").length,
      orphanFiles: orphanFiles.length,
      bytes: bytes.toString(),
    },
  };
}

/** Deletes everything findReclaimable reports. Returns how much was actually removed. */
export async function reclaim(db: PrismaClient, uploadsDir: string, now = new Date(), deleteAttachment: Deleter = deleteAttachmentAndReclaim): Promise<{ attachments: number; orphanFiles: number; failed: number }> {
  const report = await findReclaimable(db, uploadsDir, now);
  let attachments = 0;
  let orphanFiles = 0;
  let failed = 0;
  for (const item of report.items) {
    try {
      await deleteAttachment(item.id);
      attachments++;
    } catch {
      failed++;
    }
  }
  for (const o of report.orphanFiles) {
    try {
      await unlink(path.join(uploadsDir, "messages", o.name));
      orphanFiles++;
    } catch {
      failed++;
    }
  }
  return { attachments, orphanFiles, failed };
}
