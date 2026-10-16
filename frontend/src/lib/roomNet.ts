// The live side of a room: who else is in it. One websocket, a few position updates a second, and smoothing so people glide instead of jumping.
import { api, isSignedIn } from "./api";

export interface Other { id: number; name: string; x: number; z: number; yaw: number }
export interface Shown extends Other { tx: number; tz: number; tyaw: number; /** An echo of someone who was here: how visible it is (0..1). Absent for people who are here now. */ ghost?: number; note?: string }
const KEY = "exomusica_room_visible";
export const isVisible = (): boolean => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };
export const setVisible = (v: boolean): void => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ } if (!v && isSignedIn()) void api("/api/rooms/forget-echoes", { method: "POST" }).catch(() => undefined); }

const wrap = (a: number): number => { const t = Math.PI * 2, m = ((a % t) + t) % t; return m > Math.PI ? m - t : m; };
/** Move what is shown toward where each person is now. Returns true while anything is still moving. */
export function glide(shown: Map<number, Shown>, dt: number): boolean {
  const k = 1 - Math.exp(-dt * 9); let moving = false;
  for (const s of shown.values()) {
    const dx = s.tx - s.x, dz = s.tz - s.z, dy = wrap(s.tyaw - s.yaw);
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 0.004) { s.x = s.tx; s.z = s.tz; s.yaw = s.tyaw; continue; }
    s.x += dx * k; s.z += dz * k; s.yaw = wrap(s.yaw + dy * k); moving = true;
  }
  return moving;
}
/** A fresh list from the server: new people appear where they stand, people who left go, the rest get a new target. */
export function applyList(shown: Map<number, Shown>, list: Other[]): void {
  const ids = new Set(list.map((o) => o.id));
  for (const id of [...shown.keys()]) if (!ids.has(id)) shown.delete(id);
  for (const o of list) { const s = shown.get(o.id); if (s) { s.name = o.name; s.tx = o.x; s.tz = o.z; s.tyaw = o.yaw; } else shown.set(o.id, { ...o, tx: o.x, tz: o.z, tyaw: o.yaw }); }
}

export interface RoomLink { sendPose: (x: number, z: number, yaw: number) => void; close: () => void }
/** Connect to a room. Nothing is opened for guests or for people who chose to be invisible. Sends at most 5 positions a second, and one now and then when standing still. */
export function joinRoom(slug: string, onList: (l: Other[]) => void, onEchoes?: (l: unknown) => void): RoomLink | null {
  if (!isSignedIn() || !isVisible() || typeof WebSocket === "undefined") return null;
  let ws: WebSocket | null = null, closed = false, tries = 0, last = 0, lastKey = "", retry = 0, pose = "";
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/room?room=${encodeURIComponent(slug)}`);
    ws.onopen = () => { tries = 0; lastKey = ""; };
    ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data as string); if (m && m.t === "others" && Array.isArray(m.list)) onList(m.list as Other[]); else if (m && m.t === "echoes") onEchoes?.(m.list); } catch { /* ignore */ } };
    ws.onclose = () => { ws = null; if (!closed && tries < 5) retry = window.setTimeout(open, 1000 * ++tries); };
  };
  open();
  const beat = window.setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN && pose) ws.send(pose); }, 5000); // standing still: say so now and then, or the server forgets you
  return {
    sendPose(x, z, yaw) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = performance.now(), key = `${x.toFixed(1)},${z.toFixed(1)},${yaw.toFixed(1)}`;
      if (now - last < 200 || (key === lastKey && now - last < 5000)) return;
      last = now; lastKey = key; pose = JSON.stringify({ t: "pose", x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2) }); ws.send(pose);
    },
    close() { closed = true; window.clearTimeout(retry); window.clearInterval(beat); try { ws?.close(); } catch { /* ignore */ } },
  };
}
