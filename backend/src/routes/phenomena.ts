import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanPhenomenon, phenomenonSlug, type PhenomenonInput } from "../lib/phenomena.js";

const include = { exampleTrack: { select: { id: true, title: true, fileUrl: true, album: { select: { title: true } } } } } as const;
const shape = (p: { id: number; slug: string; title: string; summary: string; body: string; chain: string | null; published: boolean; exampleTrack: { id: number; title: string; fileUrl: string; album: { title: string } } | null }) => ({
  id: p.id, slug: p.slug, title: p.title, summary: p.summary, body: p.body, chain: p.chain, published: p.published,
  example: p.exampleTrack ? { id: p.exampleTrack.id, title: p.exampleTrack.title, fileUrl: p.exampleTrack.fileUrl, albumTitle: p.exampleTrack.album.title } : null,
});

export async function phenomenaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/phenomena", async () => (await prisma.phenomenon.findMany({ where: { published: true }, orderBy: { title: "asc" }, include })).map(shape));
  app.get("/api/admin/phenomena", { preHandler: requireAdmin }, async () => (await prisma.phenomenon.findMany({ orderBy: { title: "asc" }, include })).map(shape));

  app.post<{ Body: PhenomenonInput }>("/api/admin/phenomena", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanPhenomenon(req.body ?? {}, false);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const base = phenomenonSlug(r.data.title!);
    let slug = base, n = 1;
    while (await prisma.phenomenon.findUnique({ where: { slug } })) slug = `${base}-${++n}`;
    const created = await prisma.phenomenon.create({ data: { ...r.data, title: r.data.title!, slug }, include });
    return reply.code(201).send(shape(created));
  });

  app.patch<{ Params: { id: string }; Body: PhenomenonInput }>("/api/admin/phenomena/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanPhenomenon(req.body ?? {}, true);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const id = Number(req.params.id);
    if (!(await prisma.phenomenon.findUnique({ where: { id }, select: { id: true } }))) return reply.code(404).send({ error: "not found" });
    return shape(await prisma.phenomenon.update({ where: { id }, data: r.data, include }));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/phenomena/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.phenomenon.deleteMany({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
