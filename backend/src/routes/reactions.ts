import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { toMessageDTO } from "../lib/messageDto.js";
import { broadcast } from "../lib/chatHub.js";

const messageInclude = {
  author: { select: { username: true, avatarUrl: true } },
  reactions: { include: { emoji: true, user: { select: { username: true } } } },
  attachments: true,
  replyTo: { select: { id: true, contentRaw: true, author: { select: { username: true } } } },
} as const;

async function broadcastUpdatedMessage(messageId: number) {
  const message = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  const channel = await prisma.forumChannel.findUnique({ where: { id: message!.channelId } });
  broadcast(channel!.slug, { type: "message.update", message: await toMessageDTO(message!) });
}

export async function reactionRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { emojiId: number } }>(
    "/api/messages/:id/reactions",
    { preHandler: requireAuth },
    async (req, reply) => {
      const messageId = Number(req.params.id);
      const { emojiId } = req.body ?? {};
      if (!emojiId) return reply.code(400).send({ error: "emojiId is required" });
      await prisma.reaction.upsert({
        where: { messageId_userId_emojiId: { messageId, userId: req.user!.id, emojiId } },
        create: { messageId, userId: req.user!.id, emojiId },
        update: {},
      });
      await broadcastUpdatedMessage(messageId);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; emojiId: string } }>(
    "/api/messages/:id/reactions/:emojiId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const messageId = Number(req.params.id);
      const emojiId = Number(req.params.emojiId);
      await prisma.reaction.deleteMany({ where: { messageId, userId: req.user!.id, emojiId } });
      await broadcastUpdatedMessage(messageId);
      return reply.code(204).send();
    },
  );
}
