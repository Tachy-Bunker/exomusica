// "Rooms first": a branch opens as its 3D room. The classic pages stay where they are, reachable from the room ("Classic view") and by their addresses.
// Default: on, unless the person asked for Classic mode or the device is weak / asked for less motion (the same auto rule Classic mode uses). A choice made here wins.
import { readClassic } from "./classicMode";
const KEY = "exomusica_rooms3d";
export function roomsFirst(): boolean {
  try { const v = localStorage.getItem(KEY); if (v === "1") return true; if (v === "0") return false; } catch { /* storage blocked */ }
  return !readClassic().classic;
}
export function setRoomsFirst(v: boolean): void { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ } }
export const roomHref = (slug: string): string => `/branch/${encodeURIComponent(slug)}/room`;
