// The decisions behind study revision history, kept free of any database
// code so they can be unit-tested directly.

/** Saves by the same author this close together are one editing session, not separate revisions. */
export const COALESCE_WINDOW_MS = 2 * 60 * 1000;
export const MAX_REVISIONS_PER_STUDY = 200;

export interface RevisionLike {
  authorId: number | null;
  label: string | null;
  createdAt: Date;
  title: string;
  body: string;
}

export interface IncomingRevision {
  authorId: number;
  title: string;
  body: string;
  label?: string | null;
}

export type RevisionAction = "skip" | "update-last" | "create";

export function decideRevisionAction(last: RevisionLike | null, incoming: IncomingRevision, now: Date): RevisionAction {
  // Nothing changed since the newest snapshot - don't record a duplicate.
  if (last && last.title === incoming.title && last.body === incoming.body) return "skip";
  // Same author, still the same sitting, and neither side is a deliberate named snapshot.
  if (last && !last.label && !incoming.label && last.authorId === incoming.authorId && now.getTime() - last.createdAt.getTime() < COALESCE_WINDOW_MS) {
    return "update-last";
  }
  return "create";
}

/** Which snapshots to delete to stay within the cap. Labelled ones ("Original", "Restored...") are kept. */
export function idsToPrune(newestFirst: { id: number; label: string | null }[], keep = MAX_REVISIONS_PER_STUDY): number[] {
  return newestFirst.filter((r, i) => i >= keep && !r.label).map((r) => r.id);
}
