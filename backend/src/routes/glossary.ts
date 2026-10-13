import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanGlossary, type GlossaryInput } from "../lib/glossary.js";

export async function glossaryRoutes(app: FastifyInstance): Promise<void> {
  // Public: the terms for auto-linking, and which wiki page shows the glossary (the first containing a {glossary} line).
  app.get("/api/glossary", async (_req, reply) => {
    const [terms, page] = await Promise.all([
      prisma.glossaryTerm.findMany({ orderBy: { term: "asc" }, select: { id: true, term: true, aliases: true, definition: true } }),
      prisma.wikiPage.findFirst({ where: { contentMarkdown: { contains: "{glossary" } }, select: { slug: true }, orderBy: { id: "asc" } }),
    ]);
    reply.header("cache-control", "public, max-age=60");
    return { terms, pageSlug: page?.slug ?? null };
  });

  app.post<{ Body: GlossaryInput }>("/api/admin/glossary", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanGlossary(req.body ?? {}, false);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    if (await prisma.glossaryTerm.findUnique({ where: { term: r.data.term! } })) return reply.code(409).send({ error: "That term already exists" });
    return reply.code(201).send(await prisma.glossaryTerm.create({ data: { term: r.data.term!, definition: r.data.definition!, aliases: r.data.aliases ?? [] } }));
  });

  app.patch<{ Params: { id: string }; Body: GlossaryInput }>("/api/admin/glossary/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanGlossary(req.body ?? {}, true);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const id = Number(req.params.id);
    if (!(await prisma.glossaryTerm.findUnique({ where: { id }, select: { id: true } }))) return reply.code(404).send({ error: "not found" });
    return prisma.glossaryTerm.update({ where: { id }, data: r.data });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/glossary/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.glossaryTerm.deleteMany({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
