import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export async function mapOverrideRoutes(app: FastifyInstance): Promise<void> {
  // Public: the map and the rooms need these to place the doors. Few rows, small.
  app.get("/api/map-overrides", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    const rows = await prisma.mapOverride.findMany({ select: { slug: true, x: true, z: true, level: true }, take: 2000 });
    return rows;
  });

  app.put<{ Params: { slug: string }; Body: { x?: unknown; z?: unknown; level?: unknown } }>("/api/admin/map-overrides/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params; if (!SLUG.test(slug)) return reply.code(400).send({ error: "bad slug" });
    const x = num(req.body?.x, -400, 400), z = num(req.body?.z, -400, 400), lvl = num(req.body?.level, -6, 6), level = lvl == null ? null : Math.round(lvl);
    if (x == null && z == null && level == null) { await prisma.mapOverride.deleteMany({ where: { slug } }); return { slug, x: null, z: null, level: null }; }
    const data = { x, z, level };
    await prisma.mapOverride.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    return { slug, ...data };
  });

  app.delete<{ Params: { slug: string } }>("/api/admin/map-overrides/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.mapOverride.deleteMany({ where: { slug: req.params.slug } });
    return reply.code(204).send();
  });
}
