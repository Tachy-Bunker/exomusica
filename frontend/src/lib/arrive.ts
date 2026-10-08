// Which edge of the screen the last jump came from, so the new page can slide in from that side instead of just appearing.
export type Edge = "left" | "right" | "top" | "bottom";
let pending: { edge: Edge; at: number } | null = null;
export function setArrival(edge: Edge): void { pending = { edge, at: Date.now() }; }
/** The edge to arrive from, if a jump was started a moment ago (and only once). */
export function takeArrival(): Edge | null {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at < 2000 ? p.edge : null;
}
