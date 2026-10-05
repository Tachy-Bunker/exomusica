// When is an attachment just clutter? One pure answer, used by the archive.org
// list, the migration, and the reclaim tool, so they can never disagree about
// what is safe to throw away. It errs on the side of KEEPING things.

export const NEVER_POSTED_GRACE_MS = 24 * 60 * 60 * 1000;

export interface AttachmentFacts {
  createdAt: Date;
  /** Linked to a chat message: null = none, otherwise whether that message has been deleted. */
  message: { isDeleted: boolean } | null;
  hasPrivateMessage: boolean;
  /** A community track, sample bank item, album cover, branch preview or branch sketch uses it. */
  usedElsewhere: boolean;
  /** Uploaded into a study (its URL is part of the study's text). */
  studyId: number | null;
}

export type ReclaimReason = "deleted-message" | "never-posted";

export function reclaimReason(f: AttachmentFacts, now: Date, graceMs = NEVER_POSTED_GRACE_MS): ReclaimReason | null {
  if (f.usedElsewhere || f.studyId !== null || f.hasPrivateMessage) return null; // in use by something else - never clutter
  if (f.message) return f.message.isDeleted ? "deleted-message" : null;
  // not attached to anything: an upload that was never posted. Only once it's old enough that nobody is mid-composing.
  return now.getTime() - f.createdAt.getTime() >= graceMs ? "never-posted" : null;
}

export const isLocalPath = (storagePath: string) => storagePath.startsWith("/uploads/");

/** Files sitting in uploads/messages that no attachment row accounts for. */
export function orphanFileNames(onDisk: { name: string; mtimeMs: number }[], knownNames: ReadonlySet<string>, now: Date, graceMs = NEVER_POSTED_GRACE_MS): string[] {
  return onDisk.filter((f) => !knownNames.has(f.name) && now.getTime() - f.mtimeMs >= graceMs).map((f) => f.name);
}
