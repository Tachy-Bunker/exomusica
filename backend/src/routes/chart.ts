import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { buildChartNodes } from "../lib/chartData.js";
import { getMilestones } from "../lib/milestones.js";
import { buildPulses, PULSE_DAYS } from "../lib/chartPulse.js";

export async function chartRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/chart", async (_req, reply) => {
    const rows = await prisma.branch.findMany({ select: { id: true, slug: true, name: true, parentId: true, visibility: true, chartHidden: true }, orderBy: { id: "asc" } });
    void reply.header("Cache-Control", "public, max-age=60");
    return buildChartNodes(rows);
  });

  // Chart layer: anonymous pulses, only after the community reaches the milestone. Cached 5 minutes: one grouped query, however many people look.
  let cache: { at: number; pulses: Record<number, number> } | null = null;
  app.get("/api/chart/pulse", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    if (!(await getMilestones()).find((m) => m.key === "m-chart")?.reached) return { locked: true, pulses: {} };
    if (!cache || Date.now() - cache.at > 300_000) {
      const since = new Date(Date.now() - PULSE_DAYS * 86_400_000);
      const [g, branches] = await Promise.all([
        prisma.probeScan.groupBy({ by: ["key"], where: { kind: "lore", key: { startsWith: "branch:" }, at: { gte: since } }, _count: { _all: true } }),
        prisma.branch.findMany({ select: { id: true, slug: true, visibility: true, chartHidden: true } }),
      ]);
      cache = { at: Date.now(), pulses: buildPulses(g.map((r) => ({ key: r.key, people: r._count._all })), branches) };
    }
    return { locked: false, pulses: cache.pulses };
  });
}
