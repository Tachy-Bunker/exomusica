import type { FastifyInstance } from "fastify";
import { verifyToken } from "../lib/auth.js";
import { registerPresence, unregisterPresence, setViewing, onlineNow } from "../lib/presence.js";

export async function presenceRoutes(app: FastifyInstance): Promise<void> {
  // Public: the header's "N online" for visitors who are not logged in (members' names stay private to members).
  app.get("/api/online", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=10");
    return { online: onlineNow() };
  });

  app.get<{ Querystring: { token?: string } }>("/ws/presence", { websocket: true }, (socket, req) => {
    const user = req.query.token ? verifyToken(req.query.token) : null;
    if (!user) {
      socket.close();
      return;
    }

    const entry = registerPresence(socket, user.id, user.username);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "viewing") setViewing(entry, typeof msg.channelSlug === "string" ? msg.channelSlug : null);
      } catch {
        // ignore malformed presence messages
      }
    });

    socket.on("close", () => unregisterPresence(entry));
  });
}
