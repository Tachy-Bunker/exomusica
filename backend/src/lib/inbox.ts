export interface InboxItem { kind: "join" | "submission" | "reward"; id: number; title: string; who: string; at: number; to: string }

/** Oldest first: whoever has waited longest is at the top. Capped so a backlog can't make the page heavy. */
export function mergeInbox(lists: InboxItem[][], cap = 60): InboxItem[] {
  return lists.flat().sort((a, b) => a.at - b.at).slice(0, cap);
}
export const KIND_LABEL: Record<InboxItem["kind"], string> = { join: "Join request", submission: "Submission", reward: "Reward claim" };
