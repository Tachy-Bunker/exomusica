import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanDoc, emptyDoc } from "../lib/roomDoc.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function roomDocRoutes(app: FastifyInstance): Promise<void> {
  // Public: every room fetches its own document once. Empty when nobody built anything there.
  app.get<{ Params: { slug: string } }>("/api/room-doc/:slug", async (req, reply) => {
    if (!SLUG.test(req.params.slug)) return reply.code(400).send({ error: "bad slug" });
    reply.header("cache-control", "public, max-age=30");
    const row = await prisma.roomDoc.findUnique({ where: { slug: req.params.slug } });
    if (!row) return { version: 0, doc: emptyDoc() };
    return { version: row.version, doc: cleanDoc(JSON.parse(row.doc)) };
  });

  // Admin: save the whole document. `baseVersion` must be what the editor loaded, else someone else saved in between.
  app.put<{ Params: { slug: string }; Body: { doc?: unknown; baseVersion?: number } }>("/api/admin/room-doc/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG.test(slug)) return reply.code(400).send({ error: "bad slug" });
    const base = Number(req.body?.baseVersion ?? 0);
    const doc = cleanDoc(req.body?.doc);
    const row = await prisma.roomDoc.findUnique({ where: { slug } });
    if ((row?.version ?? 0) !== base) return reply.code(409).send({ error: "Someone saved this room since you opened it. Reload to continue.", version: row?.version ?? 0 });
    const version = (row?.version ?? 0) + 1;
    const data = JSON.stringify({ ...doc, version });
    if (data.length > 200_000) return reply.code(413).send({ error: "Room is too large" });
    if (row) await prisma.roomDoc.update({ where: { slug }, data: { doc: data, version } });
    else await prisma.roomDoc.create({ data: { slug, doc: data, version } });
    return { version, doc: { ...doc, version } };
  });

  app.delete<{ Params: { slug: string } }>("/api/admin/room-doc/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.roomDoc.deleteMany({ where: { slug: req.params.slug } });
    return reply.code(204).send();
  });
}
