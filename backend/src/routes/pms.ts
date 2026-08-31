import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { sendMail } from "../lib/mailer.js";

export async function pmRoutes(app: FastifyInstance): Promise<void> {
  // One row per conversation partner, most recent message first. Grouped
  // in JS rather than SQL — the conversation count per user is small
  // enough that this isn't worth a window-function query yet.
  app.get("/api/pms", { preHandler: requireAuth }, async (req) => {
    const me = req.user!.id;
    const all = await prisma.privateMessage.findMany({
      where: { OR: [{ senderId: me }, { recipientId: me }] },
      orderBy: { sentAt: "desc" },
      include: {
        sender: { select: { username: true } },
        recipient: { select: { username: true } },
      },
    });

    const byPartner = new Map<string, (typeof all)[number]>();
    for (const m of all) {
      const partner = m.senderId === me ? m.recipient.username : m.sender.username;
      if (!byPartner.has(partner)) byPartner.set(partner, m);
    }
    return [...byPartner.entries()].map(([partner, m]) => ({
      partner,
      lastMessage: m.contentRaw,
      sentAt: Math.floor(m.sentAt.getTime() / 1000),
      unread: m.recipientId === me && !m.readAt,
    }));
  });

  app.get<{ Params: { username: string } }>("/api/pms/:username", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!.id;
    const other = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!other) return reply.code(404).send({ error: "no such user" });

    const thread = await prisma.privateMessage.findMany({
      where: {
        OR: [
          { senderId: me, recipientId: other.id },
          { senderId: other.id, recipientId: me },
        ],
      },
      orderBy: { sentAt: "asc" },
    });

    await prisma.privateMessage.updateMany({
      where: { senderId: other.id, recipientId: me, readAt: null },
      data: { readAt: new Date() },
    });

    return thread.map((m) => ({
      id: m.id,
      fromMe: m.senderId === me,
      contentRaw: m.contentRaw,
      sentAt: Math.floor(m.sentAt.getTime() / 1000),
    }));
  });

  app.post<{ Params: { username: string }; Body: { contentRaw: string } }>(
    "/api/pms/:username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const contentRaw = req.body?.contentRaw;
      if (!contentRaw?.trim()) return reply.code(400).send({ error: "contentRaw is required" });
      const other = await prisma.user.findUnique({ where: { username: req.params.username } });
      if (!other) return reply.code(404).send({ error: "no such user" });
      if (other.id === req.user!.id) return reply.code(400).send({ error: "can't message yourself" });

      const message = await prisma.privateMessage.create({
        data: { senderId: req.user!.id, recipientId: other.id, contentRaw },
      });
      const sender = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (other.notifyPrivateMessage && other.email) {
        void sendMail(
          other.email,
          `New message from ${sender?.username ?? "someone"} on Exomusica`,
          `${sender?.username ?? "Someone"} sent you a message:\n\n${contentRaw}\n\nReply at your Exomusica messages page.`,
        );
      }
      return reply.code(201).send({ id: message.id, sentAt: Math.floor(message.sentAt.getTime() / 1000) });
    },
  );
}
