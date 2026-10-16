import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { requireAuth, wsUser } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
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

/** The Hidden switch changed on the account. Hidden: out of every room's view now, and no walk is recorded or kept as an echo. */
export function setRoomHidden(userId: number, hidden: boolean): void {
  hub.setHidden(userId, hidden);
  if (hidden) { ghosts.forget(userId); ghosts.stopFor(userId); }
}

export async function roomPresenceRoutes(app: FastifyInstance): Promise<void> {
  /** Going invisible also takes your echoes out of every room. */
  app.post("/api/rooms/forget-echoes", { preHandler: requireAuth }, async (req) => { ghosts.forget(req.user!.id); return { status: "ok" }; });
  /** Totals only, for the homepage line: how many people are in the rooms now. Nothing about who or where. */
  app.get("/api/rooms/online", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return hub.census();
  });
  /** Find in room, from a profile: where this member is right now. Hidden members are never found; a room's name is shown only while its branch is public. */
  app.get<{ Params: { username: string } }>("/api/users/:username/room", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const u = await prisma.user.findUnique({ where: { username: req.params.username }, select: { id: true, roomHidden: true } });
    if (!u) return reply.code(404).send({ error: "No such member" });
    if (u.roomHidden) return { state: "hidden" as const };
    const slug = hub.roomOf(u.id);
    if (!slug) return { state: "out" as const };
    const b = await prisma.branch.findUnique({ where: { slug }, select: { name: true, visibility: true } });
    if (!b || b.visibility === "HIDDEN") return { state: "out" as const };
    return { state: "in" as const, room: { slug, name: b.name } };
  });
  app.get<{ Querystring: { token?: string; room?: string } }>("/ws/room", { websocket: true }, async (socket, req) => {
    const user = wsUser(req);
    if (!user || !req.query.room) { socket.close(); return; }
    const hidden = (await prisma.user.findUnique({ where: { id: user.id }, select: { roomHidden: true } }))?.roomHidden === true;
    const key = hub.join(user.id, user.username, req.query.room, Date.now(), hidden);
    if (key == null) { socket.close(); return; }
    sockets.set(key, socket); if (!hidden) ghosts.begin(key, user.id, user.username, req.query.room);
    const echoes = ghosts.forRoom(req.query.room, user.id); if (echoes.length) socket.send(JSON.stringify({ t: "echoes", list: echoes }));
    if (!timer) timer = setInterval(tick, 250);
    socket.on("message", (raw) => {
      try { const m = JSON.parse(raw.toString()); if (m && m.t === "pose" && hub.pose(key, m)) ghosts.sample(key, hub.poseOf(key)!.x, hub.poseOf(key)!.z, hub.poseOf(key)!.yaw); } catch { /* ignore malformed */ }
    });
    socket.on("close", () => { ghosts.end(key); hub.leave(key); sockets.delete(key); });
  });
}
