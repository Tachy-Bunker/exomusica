// First-person view of a room: camera, near-plane clipping, projection, walking with collision, and what you are facing. Pure (no DOM).
import { DOOR_H, type RoomDoor, type RoomProp, type RoomWorld } from "./roomWorld";

export interface Eye { x: number; z: number; yaw: number; pitch: number }
export const EYE_Y = 1.6, NEAR = 0.12, MAX_PITCH = 0.75, WALL_MARGIN = 0.45, WALK = 3.0, RUN = 5.2, TURN = 2.2;
export const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));

/** Focal length in pixels: about 80 degrees across whatever is the narrow side of the screen. */
export const focalOf = (w: number, h: number): number => (h > w ? w * 0.72 : w * 0.62);

export type P3 = [number, number, number];
/** World point into camera space: x right, y up, z forward. */
export function toCam(e: Eye, p: P3, out: P3 = [0, 0, 0]): P3 {
  const dx = p[0] - e.x, dy = p[1] - EYE_Y, dz = p[2] - e.z;
  const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
  const cx = -dx * sy + dz * cy, cz = dx * cy + dz * sy;      // right and forward on the floor
  const sp = Math.sin(e.pitch), cp = Math.cos(e.pitch);
  out[0] = cx; out[1] = dy * cp - cz * sp; out[2] = cz * cp + dy * sp;
  return out;
}
/** Sutherland-Hodgman against the plane z = NEAR, so a wall you stand beside still draws. */
export function clipNear(poly: P3[]): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ain = a[2] >= NEAR, bin = b[2] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
  }
  return out;
}
export function toScreen(p: P3, w: number, h: number, out: [number, number] = [0, 0]): [number, number] {
  const f = focalOf(w, h); out[0] = w / 2 + (p[0] * f) / p[2]; out[1] = h / 2 - (p[1] * f) / p[2]; return out;
}

export interface Move { forward: number; strafe: number; turn: number; look: number; run?: boolean }
/** Keep the eye inside the walls and out of the pedestals. */
export function collide(world: RoomWorld, x: number, z: number): { x: number; z: number; touched: number | null } {
  const n = world.sides, step = (Math.PI * 2) / n, lim = world.inr - WALL_MARGIN;
  let touched: number | null = null;
  for (let pass = 0; pass < 3; pass++) {
    for (const p of world.props) {
      const dx = x - p.x, dz = z - p.z, L = Math.hypot(dx, dz), min = p.r + 0.35;
      if (L >= min) continue;
      const ux = L > 1e-6 ? dx / L : 1, uz = L > 1e-6 ? dz / L : 0; // pushed straight out of the pedestal
      x = p.x + ux * min; z = p.z + uz * min;
    }
    for (let k = 0; k < n; k++) { // walls last, so you can never end up outside
      const a = world.rot + (k + 0.5) * step, ox = Math.cos(a), oz = Math.sin(a), d = x * ox + z * oz;
      if (d > lim) { x -= ox * (d - lim); z -= oz * (d - lim); if (pass === 0) touched = k; }
    }
  }
  return { x, z, touched };
}
/** One step of walking and turning. `dt` in seconds. */
export function stepEye(world: RoomWorld, e: Eye, m: Move, dt: number): { eye: Eye; into: { nx: number; nz: number; edge: number } | null; moved: boolean } {
  const yaw = e.yaw + m.turn * TURN * dt, pitch = clamp(e.pitch + m.look * TURN * dt, -MAX_PITCH, MAX_PITCH);
  const sp = (m.run ? RUN : WALK) * dt, fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -Math.sin(yaw), rz = Math.cos(yaw);
  let vx = (fx * m.forward + rx * m.strafe), vz = (fz * m.forward + rz * m.strafe);
  const L = Math.hypot(vx, vz); if (L > 1) { vx /= L; vz /= L; }
  const wantX = e.x + vx * sp, wantZ = e.z + vz * sp, r = collide(world, wantX, wantZ);
  const pushed = Math.hypot(wantX - r.x, wantZ - r.z) > 1e-4;
  let into: { nx: number; nz: number; edge: number } | null = null;
  if (pushed && r.touched != null) { const a = world.rot + (r.touched + 0.5) * ((Math.PI * 2) / world.sides); const nx = Math.cos(a), nz = Math.sin(a); if (vx * nx + vz * nz > 0.15) into = { nx, nz, edge: r.touched }; }
  return { eye: { x: r.x, z: r.z, yaw: wrapYaw(yaw), pitch }, into, moved: Math.hypot(r.x - e.x, r.z - e.z) > 1e-5 || m.turn !== 0 || m.look !== 0 };
}
export const wrapYaw = (a: number): number => { const t = Math.PI * 2, m = ((a % t) + t) % t; return m > Math.PI ? m - t : m; };

/** The open door you are walking into, if any: at the wall, within the width of the door, moving toward it. */
export function doorWalkedInto(world: RoomWorld, e: Eye, into: { edge: number } | null): RoomDoor | null {
  if (!into) return null;
  for (const d of world.doors) {
    if (d.edge !== into.edge || d.state !== "open") continue;
    const along = (e.x - d.x) * d.tx + (e.z - d.z) * d.tz;
    if (Math.abs(along) <= d.hw) return d;
  }
  return null;
}

export type Target = { kind: "door"; door: RoomDoor; label: string } | { kind: "prop"; prop: RoomProp; label: string };
/** What "Use" would act on: the nearest thing in front of you, within reach. Doors count from a little further away. */
export function facing(world: RoomWorld, e: Eye, reach = 2.7): Target | null {
  const fx = Math.cos(e.yaw), fz = Math.sin(e.yaw);
  let bestKind = 0, bestIdx = -1, bestScore = Infinity; // 1 = prop, 2 = door; the Target (and its label) is only built for the winner
  for (let i = 0; i < world.props.length; i++) {
    const p = world.props[i], dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz); if (d > reach) continue;
    const cos = d < 1e-6 ? 1 : (dx * fx + dz * fz) / d; if (cos < 0.82) continue; // about 35 degrees either side
    const score = d * (2 - cos); if (score < bestScore) { bestScore = score; bestKind = 1; bestIdx = i; }
  }
  for (let i = 0; i < world.doors.length; i++) {
    const dr = world.doors[i], dx = dr.x - e.x, dz = dr.z - e.z, d = Math.hypot(dx, dz); if (d > reach + 1.8) continue;
    const cos = d < 1e-6 ? 1 : (dx * fx + dz * fz) / d; if (cos < 0.82) continue;
    const score = d * (2 - cos); if (score < bestScore) { bestScore = score; bestKind = 2; bestIdx = i; }
  }
  if (bestKind === 1) { const p = world.props[bestIdx]; return { kind: "prop", prop: p, label: p.kind === "album" ? `Open album: ${p.label}` : p.label }; }
  if (bestKind === 2) { const d = world.doors[bestIdx]; return { kind: "door", door: d, label: d.state === "open" ? `Go through: ${d.name}` : "Sealed: not found yet" }; }
  return null;
}

/** Door quad corners on the wall (slightly inside, so it draws over the wall). */
export function doorQuad(d: RoomDoor, inset = 0.02): P3[] {
  const ox = -d.nx * inset, oz = -d.nz * inset;
  return [[d.x - d.tx * d.hw + ox, 0, d.z - d.tz * d.hw + oz], [d.x + d.tx * d.hw + ox, 0, d.z + d.tz * d.hw + oz], [d.x + d.tx * d.hw + ox, DOOR_H, d.z + d.tz * d.hw + oz], [d.x - d.tx * d.hw + ox, DOOR_H, d.z - d.tz * d.hw + oz]];
}
