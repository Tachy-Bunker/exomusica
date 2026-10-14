import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { requireAuth, verifyToken } from "../lib/auth.js";
import { getMilestones } from "../lib/milestones.js";
import { BIG_MEMBERS, MAX_MEMBERS, applyOp, cleanChat, cleanCursor, guestName, JamRooms, normalizeCode, pushChat, Throttle } from "../lib/jamRoom.js";

const rooms = new JamRooms<WebSocket>();

export async function jamRoutes(app: FastifyInstance): Promise<void> {
  // Room size follows the "Jam grows" milestone. Read now and then (the milestones are cached anyway), never on the join path.
  const refreshLimit = (): void => { void getMilestones().then((l) => { rooms.limit = l.find((m) => m.key === "m-jam")?.reached ? BIG_MEMBERS : MAX_MEMBERS; }).catch(() => undefined); };
  refreshLimit();
  const sweeper = setInterval(() => { rooms.sweep(); refreshLimit(); }, 60_000);
  sweeper.unref();

  // Rooms are public: anyone with the code (or from the open list) can join, guests included. Starting one is for members, which keeps the cap from being burned by drive-by scripts.
  app.get("/api/jam/rooms", async () => rooms.list());

  // A room is made on request and lives in memory until it has been empty for ten minutes.
  app.post<{ Body: { listed?: boolean } }>("/api/jam", { preHandler: requireAuth }, async (req, reply) => {
    const code = rooms.create(req.body?.listed !== false);
    if (!code) return reply.code(503).send({ error: "All jam rooms are busy. Try again in a few minutes." });
    return reply.code(201).send({ code });
  });

  app.get<{ Params: { code: string }; Querystring: { token?: string } }>("/ws/jam/:code", { websocket: true }, (socket, req) => {
    const authed = req.query.token ? verifyToken(req.query.token) : null;
    const code = normalizeCode(req.params.code);
    if (!code) { socket.close(4404); return; }
    const room0 = rooms.rooms.get(code);
    const user = authed ?? { id: 0, username: guestName(room0 ? [...room0.members.values()].map((m) => m.username) : []) };
    const joined = rooms.join(code, socket, { id: user.id, username: user.username });
    if (joined !== "ok") { socket.close(joined === "full" ? 4409 : 4404); return; }
    const room = rooms.rooms.get(code)!;
    const send = (s: WebSocket, m: unknown) => { if (s.readyState === 1) s.send(JSON.stringify(m)); };
    const everyone = (m: unknown) => { for (const s of room.members.keys()) send(s, m); };
    const who = () => [...room.members.values()].map((m) => m.username);

    // The newcomer gets the whole room once (with the server clock, so their count lines up with everyone's), the others just a new name list.
    send(socket, { type: "state", state: room.state, members: who(), now: Date.now(), you: user.username, guest: !authed, chat: room.chat });
    for (const s of room.members.keys()) if (s !== socket) send(s, { type: "members", members: who() });

    const throttle = new Throttle(40, 1000);
    const curThrottle = new Throttle(30, 1000);
    const chatThrottle = new Throttle(5, 5000);
    socket.on("message", (raw) => {
      let msg: { op?: unknown; type?: unknown; x?: unknown; y?: unknown; text?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      // Cursors and chat have their own allowances, so a busy pointer never starves the pattern edits.
      if (msg.type === "cur") {
        if (!curThrottle.allow(Date.now())) return;
        const c = cleanCursor(msg.x, msg.y); if (!c) return;
        for (const s of room.members.keys()) if (s !== socket) send(s, { type: "cur", u: user.username, x: c.x, y: c.y });
        return;
      }
      if (msg.type === "chat") {
        if (!chatThrottle.allow(Date.now())) return;
        const text = cleanChat(msg.text); if (!text) return;
        const line = { by: user.username, text, at: Date.now() };
        pushChat(room.chat, line);
        return everyone({ type: "chat", line });
      }
      if (!throttle.allow(Date.now())) return;
      if (msg.type === "ping") return send(socket, { type: "pong", now: Date.now() });
      const next = applyOp(room.state, msg.op, Date.now());
      if (!next) return;
      room.state = next;
      // The epoch is sent with every change so a tempo change restarts everyone's bar together.
      everyone({ type: "op", op: msg.op, by: user.username, epoch: next.epoch });
    });
    socket.on("close", () => {
      rooms.leave(code, socket);
      for (const s of room.members.keys()) { send(s, { type: "members", members: who() }); send(s, { type: "gone", u: user.username }); }
    });
  });
}
