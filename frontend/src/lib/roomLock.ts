// Lock-on (Z-targeting): pick something in front of you, then the view follows it while you walk round it. Pure.
import { EYE_Y, MAX_PITCH, clamp, wrapYaw, type Eye } from "./roomView";
import { wrapPi, type RoomWorld } from "./roomWorld";
import type { Shown } from "./roomNet";

export type LockKind = "door" | "prop" | "person" | "plaque" | "artifact";
export interface Lock { kind: LockKind; id: string; x: number; y: number; z: number; label: string }
export const LOCK_REACH = 14, LOCK_DROP = 22, LOCK_CONE = 0.5;

/** Artifacts the owner placed in the room you are in (set by the room component; only those that are showing and visible to you). */
export const artifactLocks: { list: Lock[] } = { list: [] };
/** Everything that can be locked onto, with where its middle is and how to call it. */
export function lockables(world: RoomWorld, others: Iterable<Shown>): Lock[] {
  const out: Lock[] = [];
  for (const d of world.doors) out.push({ kind: "door", id: d.id, x: d.x, y: 1.25, z: d.z, label: d.state === "open" ? `Door: ${d.name}` : "Sealed door" });
  for (const p of world.props) out.push({ kind: "prop", id: p.id, x: p.x, y: 1.3, z: p.z, label: p.kind === "terminal" ? "Terminal: talk" : p.label });
  if (world.plaque) out.push({ kind: "plaque", id: "plaque", x: world.plaque.x, y: 1.6, z: world.plaque.z, label: "Inscription" });
  for (const l of artifactLocks.list) out.push(l);
  for (const o of others) out.push({ kind: "person", id: String(o.id), x: o.x, y: 1.2, z: o.z, label: o.name });
  return out;
}
/** The thing nearest the middle of your view (within ~60 degrees), preferring near ones. */
export function pickLock(world: RoomWorld, eye: Eye, others: Iterable<Shown>): Lock | null {
  const fx = Math.cos(eye.yaw), fz = Math.sin(eye.yaw); let best: Lock | null = null, bs = Infinity;
  for (const l of lockables(world, others)) {
    const dx = l.x - eye.x, dz = l.z - eye.z, d = Math.hypot(dx, dz); if (d > LOCK_REACH || d < 0.3) continue;
    const cos = (dx * fx + dz * fz) / d; if (cos < LOCK_CONE) continue;
    const s = (1 - cos) * 6 + d * 0.12; if (s < bs) { bs = s; best = l; }
  }
  return best;
}
/** Follow a person who is moving (the lock stores a position; this refreshes it). Null when the target is gone or too far. */
export function refreshLock(lock: Lock, world: RoomWorld, eye: Eye, others: Iterable<Shown>): Lock | null {
  let l: Lock | null = lock;
  if (lock.kind === "person") { l = null; for (const o of others) if (String(o.id) === lock.id) l = { ...lock, x: o.x, z: o.z, label: o.name }; }
  else if (lock.kind === "door" && !world.doors.some((d) => d.id === lock.id)) l = null;
  else if (lock.kind === "prop" && !world.props.some((p) => p.id === lock.id)) l = null;
  else if (lock.kind === "plaque" && !world.plaque) l = null;
  else if (lock.kind === "artifact" && !artifactLocks.list.some((a) => a.id === lock.id)) l = null;
  if (!l || Math.hypot(l.x - eye.x, l.z - eye.z) > LOCK_DROP) return null;
  return l;
}
/** Turn the view toward the lock, smoothly (about 9 per second), looking up or down at its height. */
export function aimAt(eye: Eye, l: Lock, dt: number): Eye {
  const k = 1 - Math.exp(-dt * 9), want = Math.atan2(l.z - eye.z, l.x - eye.x), dist = Math.max(0.5, Math.hypot(l.x - eye.x, l.z - eye.z));
  const wantPitch = clamp(Math.atan2(l.y - EYE_Y, dist), -MAX_PITCH, MAX_PITCH);
  return { ...eye, yaw: wrapYaw(eye.yaw + wrapPi(want - eye.yaw) * k), pitch: eye.pitch + (wantPitch - eye.pitch) * k };
}
