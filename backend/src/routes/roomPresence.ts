import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { requireAuth, wsUser } from "../lib/auth.js";
import { RoomHub } from "../lib/roomHub.js";
import { GhostStore } from "../lib/roomGhosts.js";

const hub = new RoomHub(), ghosts = new GhostStore(), sockets = new Map<number, WebSocket>();
let timer: ReturnType<typeof setInterval> | null = null;

/** One timer for the whole site, running only while somebody is in a room: every 250 ms the rooms that changed are sent to the people in them. */
function tick(): void {
  for (const k of hub.sweep()) { ghosts.end(k); try { sockets.get(k)?.close(); } catch { /* already gone */ } sockets.delete(k); }
  for (const room of hub.takeDirty()) {
    for (const k of hub.keysIn(room)) {
      const s = sockets.get(k); if (s && s.readyState === s.OPEN) s.send(JSON.stringify({ t: "others", list: hub.others(room, k) }));
    }
  }
  if (hub.size() === 0 && timer) { clearInterval(timer); timer = null; }
}

export async function roomPresenceRoutes(app: FastifyInstance): Promise<void> {
  /** Going invisible also takes your echoes out of every room. */
  app.post("/api/rooms/forget-echoes", { preHandler: requireAuth }, async (req) => { ghosts.forget(req.user!.id); return { status: "ok" }; });
  app.get<{ Querystring: { token?: string; room?: string } }>("/ws/room", { websocket: true }, (socket, req) => {
    const user = wsUser(req);
    const key = user && req.query.room ? hub.join(user.id, user.username, req.query.room) : null;
    if (!user || key == null) { socket.close(); return; }
    sockets.set(key, socket); ghosts.begin(key, user.id, user.username, req.query.room!);
    const echoes = ghosts.forRoom(req.query.room!, user.id); if (echoes.length) socket.send(JSON.stringify({ t: "echoes", list: echoes }));
    if (!timer) timer = setInterval(tick, 250);
    socket.on("message", (raw) => {
      try { const m = JSON.parse(raw.toString()); if (m && m.t === "pose" && hub.pose(key, m)) ghosts.sample(key, hub.poseOf(key)!.x, hub.poseOf(key)!.z, hub.poseOf(key)!.yaw); } catch { /* ignore malformed */ }
    });
    socket.on("close", () => { ghosts.end(key); hub.leave(key); sockets.delete(key); });
  });
}
