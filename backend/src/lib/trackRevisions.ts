export const MAX_REVISIONS = 3;

/** Ids to drop so only the newest `keep` remain. The list is newest first. */
export function revisionsToPrune(idsNewestFirst: number[], keep = MAX_REVISIONS): number[] {
  return idsNewestFirst.slice(keep);
}

/** The comment a new version answers: a number naming a comment that really belongs to this track, else none. */
export function answeredComment(raw: unknown, commentsOfTrack: number[]): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && commentsOfTrack.includes(n) ? n : null;
}
