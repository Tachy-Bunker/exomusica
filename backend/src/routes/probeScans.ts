import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { MAX_SCANS, scanProblem } from "../lib/probe.js";

export async function probeScanRoutes(app: FastifyInstance): Promise<void> {
  // Mine only. Re-scanning something is a no-op, so the client can send freely.
  app.get("/api/scans", { preHandler: requireAuth }, async (req) => {
    const rows = await prisma.probeScan.findMany({ where: { userId: req.user!.id }, orderBy: { at: "desc" }, select: { kind: true, key: true, at: true }, take: MAX_SCANS });
    return rows.map((r) => ({ kind: r.kind, key: r.key, at: +r.at }));
  });

  app.post<{ Body: { kind?: string; key?: string } }>("/api/scans", { preHandler: requireAuth }, async (req, reply) => {
    const bad = scanProblem(req.body ?? {});
    if (bad) return reply.code(400).send({ error: bad });
    const { kind, key } = req.body as { kind: string; key: string };
    if ((await prisma.probeScan.count({ where: { userId: req.user!.id } })) >= MAX_SCANS) return reply.code(204).send();
    await prisma.probeScan.upsert({ where: { userId_kind_key: { userId: req.user!.id, kind, key } }, create: { userId: req.user!.id, kind, key }, update: {} });
    return reply.code(204).send();
  });
}
