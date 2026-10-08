// Spending contributor points. Pure rules, tested without a database.

export interface RewardLike { active: boolean; cost: number; stock: number | null; perUser: number }

export const balanceOf = (entries: { points: number }[]): number => entries.reduce((n, e) => n + e.points, 0);

/** Why this member can't claim the reward right now (in words they can read), or null if they can. */
export function claimProblem(reward: RewardLike, balance: number, claimedByThem: number): string | null {
  if (!reward.active) return "That reward isn't available.";
  if (reward.stock !== null && reward.stock <= 0) return "That reward has run out.";
  if (claimedByThem >= reward.perUser) return reward.perUser === 1 ? "You already have that." : `You can claim that ${reward.perUser} times and you have.`;
  if (balance < reward.cost) return `You need ${reward.cost - balance} more points (it costs ${reward.cost}, you have ${Math.max(0, balance)}).`;
  return null;
}

/** A reward as an admin may save it: whole, positive cost; limits that make sense. Returns the clean values or the first problem. */
export function cleanReward(b: { title?: unknown; description?: unknown; cost?: unknown; perUser?: unknown; stock?: unknown }, partial = false): { ok: true; data: { title?: string; description?: string | null; cost?: number; perUser?: number; stock?: number | null } } | { ok: false; error: string } {
  const data: { title?: string; description?: string | null; cost?: number; perUser?: number; stock?: number | null } = {};
  if (b.title !== undefined || !partial) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) return { ok: false, error: "A reward needs a title." };
    data.title = t.slice(0, 120);
  }
  if (b.description !== undefined) data.description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 2000) : null;
  if (b.cost !== undefined || !partial) {
    const n = Number(b.cost);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return { ok: false, error: "The cost is a whole number of points, 1 or more." };
    data.cost = n;
  }
  if (b.perUser !== undefined) {
    const n = Number(b.perUser);
    if (!Number.isInteger(n) || n < 1 || n > 100) return { ok: false, error: "Per member must be a whole number from 1 to 100." };
    data.perUser = n;
  }
  if (b.stock !== undefined) {
    if (b.stock === null || b.stock === "") data.stock = null;
    else { const n = Number(b.stock); if (!Number.isInteger(n) || n < 0) return { ok: false, error: "Stock is a whole number, or blank for no limit." }; data.stock = n; }
  }
  return { ok: true, data };
}

/** A paid resource needs something to judge it by before it can be sold: a preview listen or at least one picture. */
export function previewProblem(item: { previewUrl: string | null; imageUrls: string[] }): string | null {
  return item.previewUrl || item.imageUrls.length > 0 ? null : "A paid resource needs a preview first: the author adds a short audio preview (or a link to one) and/or a picture.";
}

/** A preview link must be a web address or one of our own uploads. */
export const isPreviewLink = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^(https:\/\/|\/uploads\/)\S+$/i.test(v.trim());
