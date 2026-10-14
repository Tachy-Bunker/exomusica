// The branch chart, the testable part: where rooms sit, and what you know about each. No DOM here.
export interface ChartBranch { id: number; slug: string; name: string; parentId: number | null; secret?: boolean; key?: string }
export interface Room extends ChartBranch { col: number; row: number }
export type RoomState = "visited" | "heard" | "unseen" | "sealed";

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

/** Visited: you have been there (or scanned it). Heard of: the entrance, or next to somewhere you have been. Unseen: dark, and its name is not shown.
 *  Sealed: a hidden room nobody has found yet (only its place on the plan is known); once you have walked into it, it is an ordinary visited room.
 *  `found` holds the keys of hidden rooms this browser has been in. */
export function roomStates(list: ChartBranch[], visited: ReadonlySet<string>, found: ReadonlySet<string> = new Set()): Map<number, RoomState> {
  const byId = new Map(list.map((b) => [b.id, b]));
  const been = (b: ChartBranch): boolean => (b.secret ? !!b.key && found.has(b.key) : visited.has(b.slug));
  const known = new Set<number>();
  for (const b of list) if (been(b)) { known.add(b.id); if (b.parentId != null) known.add(b.parentId); }
  for (const b of list) { const p = b.parentId != null ? byId.get(b.parentId) : undefined; if (!p || been(p)) known.add(b.id); }
  const m = new Map<number, RoomState>();
  for (const b of list) m.set(b.id, been(b) ? "visited" : b.secret ? "sealed" : known.has(b.id) ? "heard" : "unseen");
  return m;
}
export const chartTally = (states: Map<number, RoomState>): { visited: number; heard: number; unseen: number; sealed: number } => {
  const t = { visited: 0, heard: 0, unseen: 0, sealed: 0 }; for (const s of states.values()) t[s]++; return t;
};
