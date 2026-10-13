export interface LedgerEntry { userId: number; username: string | null; points: number }

/** Points EARNED per member (spending on rewards is private and not counted), with each member's share of everything earned, in tenths of a percent. */
export function earnedShares(entries: LedgerEntry[]): { username: string; earned: number; sharePermille: number }[] {
  const m = new Map<number, { username: string; earned: number }>();
  for (const e of entries) {
    if (e.points <= 0) continue;
    const t = m.get(e.userId) ?? { username: e.username ?? "former member", earned: 0 };
    t.earned += e.points;
    m.set(e.userId, t);
  }
  const all = [...m.values()];
  const sum = all.reduce((a, t) => a + t.earned, 0);
  return all.map((t) => ({ ...t, sharePermille: sum > 0 ? Math.round((t.earned / sum) * 1000) : 0 })).sort((a, b) => b.earned - a.earned || a.username.localeCompare(b.username));
}
