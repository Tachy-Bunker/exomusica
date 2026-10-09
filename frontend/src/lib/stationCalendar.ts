/** The station's fantasy calendar (kept identical to backend/src/lib/signal.ts): 13 months of 28 days + a Null Day. Dates only, never time of day. */
export const MONTHS = ["Static", "Drift", "Carrier", "Sideband", "Squelch", "Heterodyne", "Overtone", "Formant", "Aliasing", "Phase", "Grain", "Decay", "Silence"] as const;
export const YEAR_DAYS = 365;
export function indexOfDate(cycle: number, month: number | null, day: number): number | null {
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > 999) return null;
  if (month === null) return (cycle - 1) * YEAR_DAYS + 364;
  if (!Number.isInteger(month) || month < 0 || month > 12 || !Number.isInteger(day) || day < 1 || day > 28) return null;
  return (cycle - 1) * YEAR_DAYS + month * 28 + day - 1;
}
export function dateOfIndex(idx: number): { cycle: number; month: number | null; day: number } {
  const cycle = Math.floor(idx / YEAR_DAYS) + 1, d = ((idx % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  return d === 364 ? { cycle, month: null, day: 0 } : { cycle, month: Math.floor(d / 28), day: (d % 28) + 1 };
}

export interface GraphNode { id: number; requires: number[]; quorum: number; published: boolean; title: string }
/** Layers the graph left to right by the longest chain of requirements, so the admin can see the shape of the puzzle. */
export function layoutGraph(nodes: GraphNode[], gapX = 190, gapY = 64): Map<number, { x: number; y: number; depth: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<number, number>();
  const d = (id: number, seen: Set<number>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // a loop can't be laid out; treat it as a root
    seen.add(id);
    const n = byId.get(id);
    const v = n && n.requires.length ? 1 + Math.max(...n.requires.filter((r) => byId.has(r)).map((r) => d(r, seen)), -1) : 0;
    seen.delete(id); depth.set(id, v); return v;
  };
  for (const n of nodes) d(n.id, new Set());
  const row = new Map<number, number>(), out = new Map<number, { x: number; y: number; depth: number }>();
  for (const n of [...nodes].sort((a, b) => a.id - b.id)) {
    const dp = depth.get(n.id) ?? 0, r = row.get(dp) ?? 0; row.set(dp, r + 1);
    out.set(n.id, { x: 20 + dp * gapX, y: 20 + r * gapY, depth: dp });
  }
  return out;
}
