// A corridor is a room too: it has its own document, kept in the frame of the lower-slug room (a corridor is always built from that end).
import type { Link } from "./roomScene";
import { CORR_H } from "./roomScene";
import type { RoomWorld } from "./roomWorld";

/** The document key of the corridor between two rooms (contains "~", which no room slug can). */
export const corrKey = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);
/** Where the corridor's own frame sits in the frame of the room `cur` you are in: point_in_cur = point_in_corridor + (ox, oz). */
export const corrShift = (cur: string, L: Link): { ox: number; oz: number } => (cur < L.next.slug ? { ox: 0, oz: 0 } : { ox: L.offx, oz: L.offz });
export interface CorrWorld { world: RoomWorld; cx: number; cz: number }
/** A stand-in "room" for the editor's plan: the corridor's outline, in its own frame, with the plan centred on it. */
export function corridorWorld(L: Link, cur: string): CorrWorld {
  const { ox, oz } = corrShift(cur, L), c = L.c, verts: [number, number][] = [];
  for (let i = 0; i < c.n; i++) verts.push([c.left[i * 2] - ox, c.left[i * 2 + 1] - oz]);
  for (let i = c.n - 1; i >= 0; i--) verts.push([c.right[i * 2] - ox, c.right[i * 2 + 1] - oz]);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of verts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, inr = Math.max(4, Math.max(x1 - x0, z1 - z0) / 2);
  const a = cur < L.next.slug ? cur : L.next.slug, b = cur < L.next.slug ? L.next.slug : cur;
  return { cx, cz, world: { slug: corrKey(a, b), name: `Corridor ${a} to ${b}`, sides: 0, rot: 0, R: inr, inr, H: CORR_H, verts, doors: [], props: [], spawn: { x: cx, z: cz, yaw: 0 }, plaque: null, map: { x: 0, z: 0 } } };
}
