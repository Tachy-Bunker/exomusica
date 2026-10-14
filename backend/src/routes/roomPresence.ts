import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { verifyToken } from "../lib/auth.js";
import { RoomHub } from "../lib/roomHub.js";

const hub = new RoomHub(), sockets = new Map<number, WebSocket>();
let timer: ReturnType<typeof setInterval> | null = null;

/** One timer for the whole site, running only while somebody is in a room: every 250 ms the rooms that changed are sent to the people in them. */
function tick(): void {
  for (const k of hub.sweep()) { try { sockets.get(k)?.close(); } catch { /* already gone */ } sockets.delete(k); }
  for (const room of hub.takeDirty()) {
    for (const k of hub.keysIn(room)) {
      const s = sockets.get(k); if (s && s.readyState === s.OPEN) s.send(JSON.stringify({ t: "others", list: hub.others(room, k) }));
    }
  }
  if (hub.size() === 0 && timer) { clearInterval(timer); timer = null; }
}

export async function roomPresenceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { token?: string; room?: string } }>("/ws/room", { websocket: true }, (socket, req) => {
    const user = req.query.token ? verifyToken(req.query.token) : null;
    const key = user && req.query.room ? hub.join(user.id, user.username, req.query.room) : null;
    if (!user || key == null) { socket.close(); return; }
    sockets.set(key, socket);
    if (!timer) timer = setInterval(tick, 250);
    socket.on("message", (raw) => {
      try { const m = JSON.parse(raw.toString()); if (m && m.t === "pose") hub.pose(key, m); } catch { /* ignore malformed */ }
    });
    socket.on("close", () => { hub.leave(key); sockets.delete(key); });
  });
}
