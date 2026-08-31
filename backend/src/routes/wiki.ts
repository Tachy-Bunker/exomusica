import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function wikiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/wiki", async () => {
    return prisma.wikiPage.findMany({
      select: { id: true, slug: true, title: true, parentId: true },
      orderBy: { title: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/wiki/:slug", async (req, reply) => {
    const page = await prisma.wikiPage.findUnique({ where: { slug: req.params.slug } });
    if (!page) return reply.code(404).send({ error: "no such page" });
    return page;
  });

  app.post<{ Body: { slug: string; title: string; contentMarkdown: string; parentId?: number } }>(
    "/api/admin/wiki",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { slug, title, contentMarkdown, parentId } = req.body ?? {};
      if (!slug || !title || !contentMarkdown) {
        return reply.code(400).send({ error: "slug, title, and contentMarkdown are required" });
      }
      const page = await prisma.wikiPage.create({
        data: { slug, title, contentMarkdown, parentId, updatedById: req.user!.id },
      });
      return reply.code(201).send(page);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; contentMarkdown: string; parentId: number }> }>(
    "/api/admin/wiki/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.wikiPage.update({
        where: { id: Number(req.params.id) },
        data: { ...req.body, updatedById: req.user!.id },
      });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/wiki/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.wikiPage.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
