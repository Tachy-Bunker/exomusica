import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanTarget, forgetMilestones, getMilestones, MILESTONES, METRIC_LABEL, publicShape } from "../lib/milestones.js";

export async function milestoneRoutes(app: FastifyInstance): Promise<void> {
  // Public: progress is meant to be seen (the Field Log, and the @milestone card in News).
  app.get("/api/milestones", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=60");
    return (await getMilestones()).filter((m) => m.enabled).map(publicShape);
  });

  app.get("/api/admin/milestones", { preHandler: requireAdmin }, async () =>
    (await getMilestones()).map((m) => ({ ...publicShape(m), defaultTarget: m.defaultTarget, enabled: m.enabled, metricLabel: METRIC_LABEL[m.metric] })));

  // target: a whole number, or null to go back to the default. enabled: false hides it everywhere and removes its reward.
  app.put<{ Params: { key: string }; Body: { target?: number | null; enabled?: boolean } }>("/api/admin/milestones/:key", { preHandler: requireAdmin }, async (req, reply) => {
    const key = req.params.key;
    if (!MILESTONES.some((m) => m.key === key)) return reply.code(404).send({ error: "no such milestone" });
    const body = req.body ?? {};
    const data: { target?: number | null; enabled?: boolean } = {};
    if ("target" in body) {
      const t = cleanTarget(body.target);
      if (t === undefined) return reply.code(400).send({ error: "The target must be a whole number from 1 to 10,000,000" });
      data.target = t;
    }
    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean") return reply.code(400).send({ error: "enabled must be true or false" });
      data.enabled = body.enabled;
    }
    await prisma.milestoneSetting.upsert({ where: { key }, create: { key, ...data }, update: data });
    forgetMilestones();
    const m = (await getMilestones()).find((x) => x.key === key)!;
    return { ...publicShape(m), defaultTarget: m.defaultTarget, enabled: m.enabled };
  });
}
