// Rooms joined by corridors, in one coordinate frame: the room you are in, the corridor behind an open door, and the room at its far end. Pure (no DOM).
// Only two rooms are ever held: the one you are in and the one behind the door you are heading for. The corridor is a few points, built when the door opens.
import { collide } from "./roomView";
import { DOOR_H, type RoomDoor, type RoomWorld } from "./roomWorld";

export const CORR_HW = 1.05, CORR_H = DOOR_H + 0.55, LEAD = 2.4, PASS = 0.3, OPEN_AT = 0.95;

export interface Corridor {
  n: number;
  pts: Float64Array;      // x,z pairs: the middle line, from the door of the room it starts in to the door of the other
  left: Float64Array;     // the two walls, offset from the middle line with mitred corners
  right: Float64Array;
  cum: Float64Array;      // distance along the line at each point
  len: number;
}
export interface Link {
  door: RoomDoor;         // the door in the room you are in
  back: RoomDoor;         // the door the corridor ends at, in the far room's own frame
  next: RoomWorld;
  offx: number; offz: number;   // where the far room's middle is, in this room's frame
  c: Corridor;
  open: number;           // 0 shut .. 1 open
}
export type Space = "cur" | "corridor";

const dirOf = (p: Float64Array, i: number, j: number, out: number[]): void => { const dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], L = Math.hypot(dx, dz) || 1; out[0] = dx / L; out[1] = dz / L; };
function offsets(p: Float64Array, n: number, side: number, hw: number, out: Float64Array): void {
  const a = [0, 0], b = [0, 0];
  for (let i = 0; i < n; i++) {
    if (i > 0) dirOf(p, i - 1, i, a); else dirOf(p, 0, 1, a);
    if (i < n - 1) dirOf(p, i, i + 1, b); else { b[0] = a[0]; b[1] = a[1]; }
    const n0x = -a[1] * side, n0z = a[0] * side, n1x = -b[1] * side, n1z = b[0] * side;
    let mx = n0x + n1x, mz = n0z + n1z; const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n0x; mz = n0z; } else { mx /= ml; mz /= ml; }
    const k = Math.max(0.45, mx * n0x + mz * n0z), s = hw / k;
    out[i * 2] = p[i * 2] + mx * s; out[i * 2 + 1] = p[i * 2 + 1] + mz * s;
  }
}
export function makeCorridor(flat: number[]): Corridor {
  // drop points that sit on top of each other
  const q: number[] = [];
  for (let i = 0; i < flat.length; i += 2) { const L = q.length; if (L >= 2 && Math.hypot(flat[i] - q[L - 2], flat[i + 1] - q[L - 1]) < 0.05) continue; q.push(flat[i], flat[i + 1]); }
  const n = q.length / 2, pts = Float64Array.from(q), left = new Float64Array(n * 2), right = new Float64Array(n * 2), cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[(i - 1) * 2], pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]);
  offsets(pts, n, 1, CORR_HW, left); offsets(pts, n, -1, CORR_HW, right);
  return { n, pts, left, right, cum, len: cum[n - 1] };
}

const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};
/** Nearest point of the middle line to (x,z): the point and how far away it is. */
export function nearestOnPath(c: Corridor, x: number, z: number): { x: number; z: number; d: number; seg: number } {
  let best = Infinity, bx = 0, bz = 0, bs = 0; const p = c.pts;
  for (let i = 0; i < c.n - 1; i++) {
    const ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz;
    const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), cx = ax + dx * t, cz = az + dz * t, d = Math.hypot(x - cx, z - cz);
    if (d < best) { best = d; bx = cx; bz = cz; bs = i; }
  }
  return { x: bx, z: bz, d: best, seg: bs };
}
/** Keep (x,z) within `lim` of the middle line. */
export function clampToPath(c: Corridor, x: number, z: number, lim: number): { x: number; z: number } {
  const n = nearestOnPath(c, x, z); if (n.d <= lim) return { x, z };
  const k = lim / n.d; return { x: n.x + (x - n.x) * k, z: n.z + (z - n.z) * k };
}

/** Is (x,z) inside the room's walls, `inset` in from them? */
export function inRoom(w: RoomWorld, x: number, z: number, inset = 0): boolean {
  const step = (Math.PI * 2) / w.sides, lim = w.inr - inset;
  for (let k = 0; k < w.sides; k++) { const a = w.rot + (k + 0.5) * step; if (x * Math.cos(a) + z * Math.sin(a) > lim) return false; }
  return true;
}

// ---- building a corridor between two doors
interface Cand { mid: number[]; }
function route(A: RoomWorld, B: RoomWorld, offx: number, offz: number, dA: RoomDoor, dB: RoomDoor): number[] {
  const P0 = [dA.x, dA.z], P1 = [offx + dB.x, offz + dB.z];
  const Q0 = [P0[0] + dA.nx * LEAD, P0[1] + dA.nz * LEAD], Q1 = [P1[0] + dB.nx * LEAD, P1[1] + dB.nz * LEAD];
  const cands: Cand[] = [
    { mid: [] },
    { mid: [Q1[0], Q0[1]] }, { mid: [Q0[0], Q1[1]] },
    { mid: [Q0[0] + dA.nx * 3, Q0[1] + dA.nz * 3, Q1[0] + dB.nx * 3, Q1[1] + dB.nz * 3] },
    { mid: [Q0[0] + dA.nx * 7, Q0[1] + dA.nz * 7, Q1[0] + dB.nx * 7, Q1[1] + dB.nz * 7] },
  ];
  let best = cands[0], bestCost = Infinity;
  for (const c of cands) {
    const W = [Q0[0], Q0[1], ...c.mid, Q1[0], Q1[1]], full = [P0[0], P0[1], ...W, P1[0], P1[1]], m = full.length / 2;
    let cost = 0, ok = true;
    for (let i = 0; i < m - 1; i++) {
      const dx = full[i * 2 + 2] - full[i * 2], dz = full[i * 2 + 3] - full[i * 2 + 1], L = Math.hypot(dx, dz); cost += L;
      if (i > 0 && i < m - 2 && L < 1.2) ok = false;
      if (i > 0) { const px = full[i * 2] - full[i * 2 - 2], pz = full[i * 2 + 1] - full[i * 2 - 1], PL = Math.hypot(px, pz) || 1; const dot = (px * dx + pz * dz) / (PL * (L || 1)); if (dot < -0.17) ok = false; if (dot < 0.995) cost += 5; }
    }
    for (let i = 1; i < m - 2; i++) { // the middle legs keep clear of both rooms
      if (segDist(0, 0, full[i * 2], full[i * 2 + 1], full[i * 2 + 2], full[i * 2 + 3]) < A.inr + 1) ok = false;
      if (segDist(offx, offz, full[i * 2], full[i * 2 + 1], full[i * 2 + 2], full[i * 2 + 3]) < B.inr + 1) ok = false;
    }
    if (!ok) cost += 1000;
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return [P0[0], P0[1], Q0[0], Q0[1], ...best.mid, Q1[0], Q1[1], P1[0], P1[1]];
}

/** The same corridor seen from the other end. `from` is the room the link was built in (it becomes the far room). */
export function flipLink(L: Link, from: RoomWorld): Link {
  const f: number[] = [], p = L.c.pts;
  for (let i = L.c.n - 1; i >= 0; i--) f.push(p[i * 2] - L.offx, p[i * 2 + 1] - L.offz);
  return { door: L.back, back: L.door, next: from, offx: -L.offx, offz: -L.offz, c: makeCorridor(f), open: L.open };
}
/** A corridor from `door` of `cur` to the door of `next` that leads back. Always built from the same end (the lower slug), so walking it either way is the same corridor. */
export function buildLink(cur: RoomWorld, door: RoomDoor, next: RoomWorld, open = 0): Link | null {
  const back = next.doors.find((d) => d.toSlug === cur.slug && d.state === "open");
  if (!back || !door.toSlug || door.state !== "open") return null;
  if (cur.slug > next.slug) { const L = buildLink(next, back, cur, open); return L ? flipLink(L, next) : null; }
  const mx = next.map.x - cur.map.x, mz = next.map.z - cur.map.z, m = Math.hypot(mx, mz);
  const ux = m > 1e-6 ? mx / m : door.nx, uz = m > 1e-6 ? mz / m : door.nz;
  const Dc = Math.max(cur.R + next.R + 9, Math.min(cur.R + next.R + 48, m * 2.6)), offx = ux * Dc, offz = uz * Dc;
  return { door, back, next, offx, offz, c: makeCorridor(route(cur, next, offx, offz, door, back)), open };
}

// ---- moving through it all
export interface Resolved { x: number; z: number; touched: number | null }
/** Where a step to (x,z) ends up: the nearest place that is inside the room, the open corridor or the room beyond it. */
export function resolveMove(cur: RoomWorld, link: Link | null, x: number, z: number): Resolved {
  const a = collide(cur, x, z); let best: Resolved = a, bd = Math.hypot(a.x - x, a.z - z);
  if (link && link.open >= OPEN_AT && bd > 1e-9) {
    const s = clampToPath(link.c, x, z, CORR_HW - PASS), ds = Math.hypot(s.x - x, s.z - z);
    if (ds < bd - 1e-9) { best = { x: s.x, z: s.z, touched: null }; bd = ds; }
    if (bd > 1e-9) {
      const bx = x - link.offx, bz = z - link.offz, b = collide(link.next, bx, bz), db = Math.hypot(b.x - bx, b.z - bz);
      if (db < bd - 1e-9) best = { x: b.x + link.offx, z: b.z + link.offz, touched: null };
    }
  }
  return best;
}
/** Which space the eye is in, for drawing. */
export function eyeSpace(cur: RoomWorld, link: Link | null, x: number, z: number): Space {
  if (!link || link.open <= 0.02 || inRoom(cur, x, z)) return "cur";
  return nearestOnPath(link.c, x, z).d <= CORR_HW + 0.3 ? "corridor" : "cur";
}
/** Has the eye crossed into the room at the far end? Then that room becomes the one you are in. */
export const crossed = (link: Link | null, x: number, z: number): boolean => !!link && link.open >= OPEN_AT && inRoom(link.next, x - link.offx, z - link.offz, 0.02);
