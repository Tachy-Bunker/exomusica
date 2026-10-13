// The branch chart, the testable part: where rooms sit, and what you know about each. No DOM here.
export interface ChartBranch { id: number; slug: string; name: string; parentId: number | null }
export interface Room extends ChartBranch { col: number; row: number }
export type RoomState = "visited" | "heard" | "unseen";

/** A tidy tree: depth is the column, leaves take consecutive rows, a parent sits level with the middle of its children. Cycles and orphans cannot hang it. */
export function layoutChart(list: ChartBranch[]): { rooms: Room[]; cols: number; rows: number } {
  const ids = new Set(list.map((b) => b.id));
  const kids = new Map<number, ChartBranch[]>();
  const roots: ChartBranch[] = [];
  for (const b of list) {
    if (b.parentId != null && ids.has(b.parentId) && b.parentId !== b.id) { const a = kids.get(b.parentId) ?? []; a.push(b); kids.set(b.parentId, a); } else roots.push(b);
  }
  const out = new Map<number, Room>();
  let row = 0, cols = 0;
  const place = (b: ChartBranch, col: number, seen: Set<number>): number => {
    seen.add(b.id); cols = Math.max(cols, col + 1);
    const ch = (kids.get(b.id) ?? []).filter((c) => !seen.has(c.id));
    let r: number;
    if (ch.length === 0) r = row++;
    else { const rs = ch.map((c) => place(c, col + 1, seen)); r = (rs[0] + rs[rs.length - 1]) / 2; }
    out.set(b.id, { ...b, col, row: r });
    return r;
  };
  const seen = new Set<number>();
  for (const r of roots) if (!seen.has(r.id)) place(r, 0, seen);
  for (const b of list) if (!seen.has(b.id)) place(b, 0, seen); // a cycle with no root: still show it
  return { rooms: list.map((b) => out.get(b.id)!), cols, rows: Math.max(row, 1) };
}

/** Visited: you have been there (or scanned it). Heard of: the entrance, or next to somewhere you have been. Unseen: dark, and its name is not shown. */
export function roomStates(list: ChartBranch[], visited: ReadonlySet<string>): Map<number, RoomState> {
  const byId = new Map(list.map((b) => [b.id, b]));
  const known = new Set<number>();
  for (const b of list) if (visited.has(b.slug)) { known.add(b.id); if (b.parentId != null) known.add(b.parentId); }
  for (const b of list) if (b.parentId == null || !byId.has(b.parentId) || visited.has(byId.get(b.parentId)!.slug)) known.add(b.id);
  const m = new Map<number, RoomState>();
  for (const b of list) m.set(b.id, visited.has(b.slug) ? "visited" : known.has(b.id) ? "heard" : "unseen");
  return m;
}
export const chartTally = (states: Map<number, RoomState>): { visited: number; heard: number; unseen: number } => {
  const t = { visited: 0, heard: 0, unseen: 0 }; for (const s of states.values()) t[s]++; return t;
};
