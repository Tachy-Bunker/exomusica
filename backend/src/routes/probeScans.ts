import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { MAX_SCANS, scanProblem } from "../lib/probe.js";
import { awardUpgrades } from "./upgrades.js";
import { getMilestones } from "../lib/milestones.js";

// "How many others scanned this" is the same answer for everyone for a minute, so a busy card costs one query, not one per look.
const seenCache = new Map<string, { at: number; n: number }>();

export async function probeScanRoutes(app: FastifyInstance): Promise<void> {
  // Mine only. Re-scanning something is a no-op, so the client can send freely.
  app.get("/api/scans", { preHandler: requireAuth }, async (req) => {
    const rows = await prisma.probeScan.findMany({ where: { userId: req.user!.id }, orderBy: { at: "desc" }, select: { kind: true, key: true, at: true }, take: MAX_SCANS });
    return rows.map((r) => ({ kind: r.kind, key: r.key, at: +r.at }));
  });

  // Shared lens (a community milestone). Until the community reaches it the answer is null, so nobody learns counts early.
  app.get<{ Querystring: { kind?: string; key?: string } }>("/api/scans/seen", { preHandler: requireAuth }, async (req, reply) => {
    const bad = scanProblem(req.query ?? {});
    if (bad) return reply.code(400).send({ error: bad });
    const { kind, key } = req.query as { kind: string; key: string };
    const lens = (await getMilestones()).find((m) => m.key === "m-sharedlens");
    if (!lens?.reached) return { others: null };
    const id = `${kind}|${key}`;
    const hit = seenCache.get(id);
    let all = hit && Date.now() - hit.at < 60_000 ? hit.n : null;
    if (all === null) {
      all = await prisma.probeScan.count({ where: { kind, key } });
      if (seenCache.size > 2000) seenCache.clear();
      seenCache.set(id, { at: Date.now(), n: all });
    }
    const mine = await prisma.probeScan.count({ where: { userId: req.user!.id, kind, key } }); // cheap: the unique index
    return { others: Math.max(0, all - mine) };
  });

  // Thermal lens, second reading (milestone m-thermal): which pages the community scans most. Aggregated, no names. Cached 5 minutes.
  let heatCache: { at: number; rows: [string, number][] } | null = null;
  app.get("/api/scans/heat", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    const m = (await getMilestones()).find((x) => x.key === "m-thermal");
    if (!m?.reached) return { locked: true, rows: [] };
    if (!heatCache || Date.now() - heatCache.at > 300_000) {
      const g = await prisma.probeScan.groupBy({ by: ["key"], where: { kind: { in: ["track", "lore", "person"] } }, _count: { _all: true }, orderBy: { _count: { key: "desc" } }, take: 600 });
      heatCache = { at: Date.now(), rows: g.map((r) => [r.key, r._count._all] as [string, number]) };
    }
    return { locked: false, rows: heatCache.rows };
  });

  app.post<{ Body: { kind?: string; key?: string } }>("/api/scans", { preHandler: requireAuth }, async (req, reply) => {
    const bad = scanProblem(req.body ?? {});
    if (bad) return reply.code(400).send({ error: bad });
    const { kind, key } = req.body as { kind: string; key: string };
    if ((await prisma.probeScan.count({ where: { userId: req.user!.id } })) >= MAX_SCANS) return reply.code(204).send();
    const existed = await prisma.probeScan.findUnique({ where: { userId_kind_key: { userId: req.user!.id, kind, key } }, select: { kind: true } });
    await prisma.probeScan.upsert({ where: { userId_kind_key: { userId: req.user!.id, kind, key } }, create: { userId: req.user!.id, kind, key }, update: {} });
    if (existed) return reply.code(204).send(); // a re-scan can't earn anything
    const earned = await awardUpgrades(req.user!.id).catch(() => [] as string[]);
    return earned.length ? { earned } : reply.code(204).send();
  });
}
