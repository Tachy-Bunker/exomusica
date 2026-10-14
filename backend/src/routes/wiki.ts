import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

// A page may not sit under itself or under one of its own descendants.
export async function parentProblem(id: number | null, parentId: number | null): Promise<string | null> {
  if (parentId == null) return null;
  if (!Number.isInteger(parentId)) return "bad parent";
  if (id != null && parentId === id) return "A page can't be its own parent";
  const all = await prisma.wikiPage.findMany({ select: { id: true, parentId: true } });
  const up = new Map(all.map((p) => [p.id, p.parentId]));
  if (!up.has(parentId)) return "That parent page doesn't exist";
  let cur: number | null | undefined = parentId;
  for (let n = 0; cur != null && n < 1000; n++) {
    if (id != null && cur === id) return "That would put the page under one of its own sub-pages";
    cur = up.get(cur);
  }
  return null;
}

export async function wikiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/wiki", async () => {
    return prisma.wikiPage.findMany({
      select: { id: true, slug: true, title: true, parentId: true },
      orderBy: { title: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/wiki/:slug", async (req, reply) => {
    const page = await prisma.wikiPage.findUnique({ where: { slug: req.params.slug }, include: { font: true } });
    if (!page) return reply.code(404).send({ error: "no such page" });
    return page;
  });

  app.post<{ Body: { slug: string; title: string; contentMarkdown: string; parentId?: number | null; fontId?: number | null; ogTitle?: string | null; ogDescription?: string | null; ogImageUrl?: string | null } }>(
    "/api/admin/wiki",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { slug, title, contentMarkdown, parentId, fontId, ogTitle, ogDescription, ogImageUrl } = req.body ?? {};
      if (!slug || !title || !contentMarkdown) {
        return reply.code(400).send({ error: "slug, title, and contentMarkdown are required" });
      }
      const bad = await parentProblem(null, parentId ?? null);
      if (bad) return reply.code(400).send({ error: bad });
      const page = await prisma.wikiPage.create({
        data: { slug, title, contentMarkdown, parentId: parentId ?? null, fontId: fontId ?? null, ogTitle: ogTitle || null, ogDescription: ogDescription || null, ogImageUrl: ogImageUrl || null, updatedById: req.user!.id },
      });
      return reply.code(201).send(page);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; contentMarkdown: string; parentId: number | null; fontId: number | null; ogTitle: string | null; ogDescription: string | null; ogImageUrl: string | null }> }>(
    "/api/admin/wiki/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = Number(req.params.id);
      const body: Record<string, unknown> & { parentId?: number | null } = { ...(req.body ?? {}) } as never;
      if ("parentId" in body) {
        body.parentId = body.parentId == null || (body.parentId as unknown) === "" ? null : Number(body.parentId);
        const bad = await parentProblem(id, body.parentId);
        if (bad) return reply.code(400).send({ error: bad });
      }
      return prisma.wikiPage.update({
        where: { id },
        data: { ...body, updatedById: req.user!.id },
      });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/wiki/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.wikiPage.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
