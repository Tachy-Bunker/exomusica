import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { kind?: "BRANCH" | "DISCUSSION" } }>("/api/channels", async (req) => {
    return prisma.forumChannel.findMany({
      where: req.query.kind ? { kind: req.query.kind } : undefined,
      orderBy: { createdAt: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/channels/:slug", async (req, reply) => {
    const channel = await prisma.forumChannel.findUnique({
      where: { slug: req.params.slug },
      include: { branch: { select: { slug: true, name: true } } },
    });
    if (!channel) return reply.code(404).send({ error: "no such channel" });
    return channel;
  });

  // Discussion topics (Art You Like, Science, Primal Taste Theory, ...) have
  // no branch — branch topics come from POST /api/admin/branches instead.
  app.post<{ Body: { slug: string; name: string } }>(
    "/api/admin/channels",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { slug, name } = req.body ?? {};
      if (!slug || !name) {
        return reply.code(400).send({ error: "slug and name are required" });
      }
      const channel = await prisma.forumChannel.create({
        data: { slug, name, kind: "DISCUSSION" },
      });
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: "channel.create", targetType: "ForumChannel", targetId: channel.id },
      });
      return reply.code(201).send(channel);
    },
  );
}
