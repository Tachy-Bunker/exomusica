import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getMilestones } from "../lib/milestones.js";
import { armsOf, stormSeed, stormWindow, STORM_GOAL } from "../lib/storm.js";

// The count and the arms are the same for everyone, so they are computed at most every 30 seconds (an ended storm never changes: kept for an hour).
let cache: { at: number; reachedAt: number; v: { count: number; arms: ReturnType<typeof armsOf> } } | null = null;

export async function stormRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/storm", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=20");
    const m = (await getMilestones()).find((x) => x.key === "m-storm");
    if (!m?.reached || !m.reachedAt) return { locked: true };
    const now = Date.now(), reachedAt = +new Date(m.reachedAt), w = stormWindow(reachedAt, now);
    const ttl = w.state === "ended" ? 3_600_000 : 30_000;
    if (!cache || cache.reachedAt !== reachedAt || Date.now() - cache.at > ttl) {
      const from = new Date(w.startsAt), to = new Date(w.endsAt);
      const [count, groups] = await Promise.all([
        prisma.probeScan.count({ where: { at: { gte: from, lt: to } } }),
        w.state === "ended" ? prisma.probeScan.groupBy({ by: ["kind", "key"], where: { at: { gte: from, lt: to } }, _count: { _all: true }, orderBy: { _count: { key: "desc" } }, take: 200 }) : Promise.resolve([]),
      ]);
      cache = { at: Date.now(), reachedAt, v: { count, arms: armsOf(groups.map((g: { kind: string; key: string; _count: { _all: number } }) => ({ kind: g.kind, key: g.key, n: g._count._all }))) } };
    }
    const { count, arms } = cache.v, full = count >= STORM_GOAL;
    return {
      locked: false, state: w.state, startsAt: w.startsAt, endsAt: w.endsAt, goal: STORM_GOAL, count: Math.min(count, STORM_GOAL), full, serverNow: now,
      // Until the storm ends nothing about the Artifact leaks; after it, only a full meter opens it.
      artifact: w.state === "ended" && full ? { seed: stormSeed(reachedAt), total: count, arms } : null,
    };
  });
}
