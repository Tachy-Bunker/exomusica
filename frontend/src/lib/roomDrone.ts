// The drone: the audio player as a small thing that hovers beside you. Pure (no DOM).
import { collide, type Eye } from "./roomView";
import type { RoomWorld } from "./roomWorld";

export interface Drone { x: number; z: number; y: number }
const KEY = "exomusica_drone";
export const droneWanted = (): boolean => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };
export const setDroneWanted = (v: boolean): void => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };

const AHEAD = 1.15, SIDE = 0.45, HEIGHT = 1.35, FOLLOW = 4.5;
/** Where it wants to be: ahead and to the right of you, at head height, bobbing a little. */
export function droneHome(e: Eye, t: number): Drone {
  const fx = Math.cos(e.yaw), fz = Math.sin(e.yaw), rx = -Math.sin(e.yaw), rz = Math.cos(e.yaw);
  return { x: e.x + fx * AHEAD + rx * SIDE, z: e.z + fz * AHEAD + rz * SIDE, y: HEIGHT + Math.sin(t * 2.1) * 0.06 + e.pitch * -0.2 };
}
export const startDrone = (e: Eye): Drone => droneHome(e, 0);
/** One step: it glides toward its spot (so it trails when you turn or run), and stays inside the walls and out of the pedestals. Returns true when it moved. */
export function stepDrone(d: Drone, e: Eye, world: RoomWorld, t: number, dt: number): boolean {
  const h = droneHome(e, t), k = 1 - Math.exp(-dt * FOLLOW), nx = d.x + (h.x - d.x) * k, nz = d.z + (h.z - d.z) * k;
  const c = collide(world, nx, nz), ny = h.y + (d.y - h.y) * Math.exp(-dt * 8);
  const moved = Math.abs(c.x - d.x) + Math.abs(c.z - d.z) + Math.abs(ny - d.y) > 5e-4; d.x = c.x; d.z = c.z; d.y = ny; return moved;
}
