import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function forumMapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/forum-map", async () => {
    const nodes = await prisma.forumMapNode.findMany({
      include: { channel: { select: { slug: true, name: true, kind: true, branchId: true, contentMarkdown: true } } },
    });
    return nodes;
  });

  app.post<{ Body: { type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS"; channelId: number; parentId?: number | null; x: number; y: number } }>(
    "/api/admin/forum-map/nodes",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { type, channelId, parentId, x, y } = req.body ?? {};
      if (!channelId) return reply.code(400).send({ error: "channelId is required" });
      const node = await prisma.forumMapNode.create({
        data: { type, channelId, parentId: parentId ?? null, x: x ?? 0, y: y ?? 0 },
      });
      return reply.code(201).send(node);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ parentId: number | null; x: number; y: number; color: string | null; size: number | null }> }>(
    "/api/admin/forum-map/nodes/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.forumMapNode.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/forum-map/nodes/:id", { preHandler: requireAdmin }, async (req) => {
    await prisma.forumMapNode.delete({ where: { id: Number(req.params.id) } });
    return { status: "ok" };
  });
}
