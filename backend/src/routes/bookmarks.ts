import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { toDayKey } from "../lib/dayKey.js";

export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/api/messages/:id/bookmark",
    { preHandler: requireAuth },
    async (req, reply) => {
      const messageId = Number(req.params.id);
      const bookmark = await prisma.bookmark.upsert({
        where: { userId_messageId: { userId: req.user!.id, messageId } },
        create: { userId: req.user!.id, messageId, note: req.body?.note },
        update: { note: req.body?.note },
      });
      return reply.code(201).send(bookmark);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id/bookmark",
    { preHandler: requireAuth },
    async (req, reply) => {
      await prisma.bookmark.deleteMany({ where: { userId: req.user!.id, messageId: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );

  // Powers "show my bookmarks when I open this day's archive" — one call
  // per day view rather than N calls per message.
  app.get<{ Params: { slug: string }; Querystring: { day?: string } }>(
    "/api/channels/:slug/bookmarks",
    { preHandler: requireAuth },
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });
      const { day } = req.query;
      const bookmarks = await prisma.bookmark.findMany({
        where: {
          userId: req.user!.id,
          message: {
            channelId: channel.id,
            ...(day ? { dayKey: toDayKey(new Date(day)) } : {}),
          },
        },
        select: { messageId: true, note: true },
      });
      return bookmarks;
    },
  );
}
