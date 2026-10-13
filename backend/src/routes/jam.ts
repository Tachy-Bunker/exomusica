import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { requireAuth, verifyToken } from "../lib/auth.js";
import { applyOp, JamRooms, normalizeCode, Throttle } from "../lib/jamRoom.js";

const rooms = new JamRooms<WebSocket>();

export async function jamRoutes(app: FastifyInstance): Promise<void> {
  const sweeper = setInterval(() => rooms.sweep(), 60_000);
  sweeper.unref();

  // Members only: a room is made on request and lives in memory until it has been empty for ten minutes.
  app.post("/api/jam", { preHandler: requireAuth }, async (_req, reply) => {
    const code = rooms.create();
    if (!code) return reply.code(503).send({ error: "All jam rooms are busy. Try again in a few minutes." });
    return reply.code(201).send({ code });
  });

  app.get<{ Params: { code: string }; Querystring: { token?: string } }>("/ws/jam/:code", { websocket: true }, (socket, req) => {
    const user = req.query.token ? verifyToken(req.query.token) : null;
    const code = normalizeCode(req.params.code);
    if (!user || !code) { socket.close(4401); return; }
    const joined = rooms.join(code, socket, { id: user.id, username: user.username });
    if (joined !== "ok") { socket.close(joined === "full" ? 4409 : 4404); return; }
    const room = rooms.rooms.get(code)!;
    const send = (s: WebSocket, m: unknown) => { if (s.readyState === 1) s.send(JSON.stringify(m)); };
    const everyone = (m: unknown) => { for (const s of room.members.keys()) send(s, m); };
    const who = () => [...room.members.values()].map((m) => m.username);

    // The newcomer gets the whole room once (with the server clock, so their count lines up with everyone's), the others just a new name list.
    send(socket, { type: "state", state: room.state, members: who(), now: Date.now(), you: user.username });
    for (const s of room.members.keys()) if (s !== socket) send(s, { type: "members", members: who() });

    const throttle = new Throttle(40, 1000);
    socket.on("message", (raw) => {
      if (!throttle.allow(Date.now())) return;
      let msg: { op?: unknown; type?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "ping") return send(socket, { type: "pong", now: Date.now() });
      const next = applyOp(room.state, msg.op, Date.now());
      if (!next) return;
      room.state = next;
      // The epoch is sent with every change so a tempo change restarts everyone's bar together.
      everyone({ type: "op", op: msg.op, by: user.username, epoch: next.epoch });
    });
    socket.on("close", () => {
      rooms.leave(code, socket);
      for (const s of room.members.keys()) send(s, { type: "members", members: who() });
    });
  });
}
