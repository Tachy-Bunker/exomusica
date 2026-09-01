import type { FastifyInstance } from "fastify";
import { verifyToken } from "../lib/auth.js";
import { registerPresence, unregisterPresence, setViewing } from "../lib/presence.js";

export async function presenceRoutes(app: FastifyInstance): Promise<void> {
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
