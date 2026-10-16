// The elevator: a corridor between two floors. The corridor's walls go up to the higher floor; a spiral of small
// platforms, alternating walls, climbs the gap; a solid deck carries the high end of the corridor. The solids are
// not saved in the corridor's document: they are made from the corridor's geometry when the link is known.
import { cleanDoc, emptyDoc, WireRuntime, type Actor, type RoomDoc } from "./roomDoc";
import { CORR_HW, type Corridor, type Link } from "./roomScene";

/** Metres. A platform is RISE above the one before it: more than a walk-up step (0.5) and less than a jump (0.8), so each rise is a jump, an easy one. */
export const ELEV = { RISE: 0.6, PLAT: 1.5, GAP: 0.9, IN: 0.95, THICK: 0.25, MARGIN: 2, RUN: 0.9 } as const; // MARGIN: floor before and after the spiral; RUN: the least a short corridor keeps at each end

/** A point on the middle line at arc length `s`, with the unit vectors from it to each wall and the direction of travel. */
function frameAt(c: Corridor, s: number): { x: number; z: number; tx: number; tz: number; lx: number; lz: number; rx: number; rz: number } {
  const L = c.cum[c.n - 1], q = Math.min(L, Math.max(0, s));
  let i = 0; while (i < c.n - 2 && c.cum[i + 1] < q) i++;
  const span = c.cum[i + 1] - c.cum[i] || 1, t = Math.min(1, Math.max(0, (q - c.cum[i]) / span));
  const P = c.pts, A = c.left, B = c.right, lerp = (arr: Float64Array, k: number): number => arr[i * 2 + k] + (arr[i * 2 + 2 + k] - arr[i * 2 + k]) * t;
  const x = lerp(P, 0), z = lerp(P, 1), ax = lerp(A, 0), az = lerp(A, 1), bx = lerp(B, 0), bz = lerp(B, 1);
  const dx = P[i * 2 + 2] - P[i * 2], dz = P[i * 2 + 3] - P[i * 2 + 1], dl = Math.hypot(dx, dz) || 1, tx = dx / dl, tz = dz / dl;
  const la = Math.hypot(ax - x, az - z) || 1, lb = Math.hypot(bx - x, bz - z) || 1;
  return { x, z, tx, tz, lx: (ax - x) / la, lz: (az - z) / la, rx: (bx - x) / lb, rz: (bz - z) / lb };
}

function solid(id: string, x: number, z: number, w: number, d: number, rot: number, lift: number, h: number): Record<string, unknown> {
  return { id, kind: "solid", name: id, x, z, w, d, h, rot, sides: 0, color: "#6f7d89", on: true, pulse: 0, lift, prop: "", season: 0 };
}

/** The solids of an elevator corridor of height `H` (metres) in the corridor's world frame: the spiral from the low end, then the
 *  deck over the high end. `highFar` says the far room is the higher one. Empty when the corridor is too short to hold it. */
export function elevatorSolids(c: Corridor, H: number, highFar: boolean): Actor[] {
  const L = c.cum[c.n - 1], out: Record<string, unknown>[] = [];
  if (!(H > 0.2) || !(L > 2 * ELEV.RUN)) return [];
  const n = Math.max(2, Math.ceil(H / ELEV.RISE)), r = H / n; // every platform rises the same, a little under a jump
  let plat: number = ELEV.PLAT, gap: number = ELEV.GAP, total = n * plat + (n - 1) * gap;
  let avail = L - 2 * ELEV.MARGIN;
  if (total > avail) { // a short corridor: squeeze the spiral, keeping a run-up at each end
    avail = L - 2 * ELEV.RUN;
    const k = avail / total; plat = Math.max(0.8, plat * k); gap = Math.max(0.5, gap * k); total = n * plat + (n - 1) * gap;
    if (total > avail + 1e-6) return []; // too short for this climb even squeezed: no spiral rather than platforms past the walls
  }
  const a = (L - total) / 2, b = a + total, dir = highFar ? 1 : -1, low = highFar ? a : b;
  const off = CORR_HW - ELEV.IN / 2;
  for (let k = 0; k < n; k++) { // platform k sits on the wall that alternates, at height (k+1)·r
    const s = low + dir * (plat / 2 + k * (plat + gap)), f = frameAt(c, s), side = k % 2 === 0;
    const ux = side ? f.lx : f.rx, uz = side ? f.lz : f.rz;
    out.push(solid(`elev-${k}`, f.x + ux * off, f.z + uz * off, plat, ELEV.IN, Math.atan2(f.tz, f.tx), (k + 1) * r - ELEV.THICK, ELEV.THICK));
  }
  // the deck: one piece per corridor segment, the full width, from the high end's door to the spiral
  const d1 = highFar ? b : 0, d2 = highFar ? L : a;
  for (let i = 0; i < c.n - 1; i++) {
    const s1 = Math.max(d1, c.cum[i]), s2 = Math.min(d2, c.cum[i + 1]);
    if (s2 - s1 < 0.05) continue;
    const f = frameAt(c, (s1 + s2) / 2);
    out.push(solid(`elev-deck-${i}`, f.x, f.z, s2 - s1, 2 * CORR_HW - 0.04, Math.atan2(f.tz, f.tx), 0, H));
  }
  // cleanDoc fills in the defaults but rounds lifts to quarter metres; the spiral needs its exact rises, so they go back in
  const exact = new Map(out.map((o) => [o.id as string, o]));
  return cleanDoc({ ...emptyDoc(), actors: out }).actors.map((a) => {
    const e = exact.get(a.id); if (!e) return a;
    return { ...a, x: e.x as number, z: e.z as number, w: e.w as number, d: e.d as number, h: e.h as number, rot: e.rot as number, lift: e.lift as number };
  });
}

/** The elevator of the link being walked now, for drawing and for the feet (its solids are in the link's world frame). */
export const elevLayer: { key: string; doc: RoomDoc | null; rt: WireRuntime | null; ox: number; oz: number; edit: boolean; sel: string | null } = { key: "", doc: null, rt: null, ox: 0, oz: 0, edit: false, sel: null };
let elevOf: Corridor | null = null, elevH = 0, elevHigh = false;
/** Makes the elevator layer match the link (or clears it). Cached: a new corridor geometry or a new climb makes new solids. */
export function setElevator(L: Link | null): void {
  const H = L ? Math.abs(L.curLev - L.farLev) : 0, high = !!L && L.farLev > L.curLev;
  if (!L || !(H > 0.2)) { elevOf = null; elevLayer.doc = null; elevLayer.rt = null; return; }
  if (elevOf === L.c && elevH === H && elevHigh === high) return;
  elevOf = L.c; elevH = H; elevHigh = high;
  const doc: RoomDoc = { ...emptyDoc(), actors: elevatorSolids(L.c, H, high) };
  elevLayer.doc = doc; elevLayer.rt = new WireRuntime(doc, null, 0);
}
