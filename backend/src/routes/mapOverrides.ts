import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const GATE = /^(|[a-z0-9][a-z0-9._-]{0,60})$/;
const KINDS = ["corridor", "lift"] as const;
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

  // Map links (fix406). Public read: the explorer, the room's doors and the lift cabin need them.
  app.get("/api/map-links", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return prisma.mapLink.findMany({ select: { id: true, fromSlug: true, toSlug: true, kind: true, gate: true }, orderBy: { id: "asc" }, take: 2000 });
  });

  app.post<{ Body: { fromSlug?: unknown; toSlug?: unknown; kind?: unknown; gate?: unknown } }>("/api/admin/map-links", { preHandler: requireAdmin }, async (req, reply) => {
    const { fromSlug, toSlug, kind, gate } = req.body ?? {};
    if (typeof fromSlug !== "string" || typeof toSlug !== "string" || !SLUG.test(fromSlug) || !SLUG.test(toSlug)) return reply.code(400).send({ error: "bad slug" });
    if (fromSlug === toSlug) return reply.code(400).send({ error: "a room cannot link to itself" });
    if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) return reply.code(400).send({ error: "bad kind" });
    if (typeof gate !== "string" || !GATE.test(gate)) return reply.code(400).send({ error: "bad gate" });
    // a corridor is one link both ways: store it once, from the lower slug
    const [a, b] = kind === "corridor" && fromSlug > toSlug ? [toSlug, fromSlug] : [fromSlug, toSlug];
    const row = await prisma.mapLink.upsert({
      where: { fromSlug_toSlug_kind: { fromSlug: a, toSlug: b, kind } },
      update: { gate },
      create: { fromSlug: a, toSlug: b, kind, gate },
      select: { id: true, fromSlug: true, toSlug: true, kind: true, gate: true },
    });
    return row;
  });

  app.patch<{ Params: { id: string }; Body: { gate?: unknown } }>("/api/admin/map-links/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id); const gate = req.body?.gate;
    if (!Number.isInteger(id) || typeof gate !== "string" || !GATE.test(gate)) return reply.code(400).send({ error: "bad request" });
    const row = await prisma.mapLink.update({ where: { id }, data: { gate }, select: { id: true, fromSlug: true, toSlug: true, kind: true, gate: true } }).catch(() => null);
    return row ?? reply.code(404).send({ error: "not found" });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/map-links/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id); if (!Number.isInteger(id)) return reply.code(400).send({ error: "bad id" });
    await prisma.mapLink.deleteMany({ where: { id } });
    return reply.code(204).send();
  });
}
