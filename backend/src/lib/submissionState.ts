export type SubmissionState = "started" | "waiting" | "approved" | "not-accepted";

/**
 * What a member's submission to a branch means in plain terms. A new submission is PENDING until a person on the team decides, so
 * "waiting" is the honest word. A pending one with no tracks yet has only been started.
 */
export function submissionState(status: "PENDING" | "APPROVED" | "REJECTED", trackCount: number): SubmissionState {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "not-accepted";
  return trackCount === 0 ? "started" : "waiting";
}
