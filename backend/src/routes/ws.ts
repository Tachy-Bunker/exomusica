import type { FastifyInstance } from "fastify";
import { subscribe } from "../lib/chatHub.js";

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  // Read-only channel: sending a message is POST /api/channels/:slug/messages
  // (authenticated, persisted, then broadcast from there). This socket only
  // delivers the resulting message.create/update/delete events.
  app.get<{ Params: { channelSlug: string } }>(
    "/ws/:channelSlug",
    { websocket: true },
    (socket, req) => {
      subscribe(req.params.channelSlug, socket);
    },
  );
}
