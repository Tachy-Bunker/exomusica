import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { cleanBossBody, MONTH_RE } from "../lib/monthlyCore.js";
import { adminMonthly, getMine, getMonthly, recordListen, recordRun, saveBoss } from "../lib/monthly.js";

export async function monthlyRoutes(app: FastifyInstance): Promise<void> {
  // Public: the month's brief and the shared bar. Everyone sees the same numbers.
  app.get("/api/monthly", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=30");
    return getMonthly();
  });

  // Mine only: my listening minutes and room runs this month.
  app.get("/api/monthly/mine", { preHandler: requireAuth }, async (req) => getMine(req.user!.id));

  // A heartbeat while the boss track plays. Always 204: the client needs no answer, and refusals are not news.
  app.post<{ Body: { trackId?: unknown } }>("/api/monthly/listen", { preHandler: requireAuth }, async (req, reply) => {
    const trackId = Number(req.body?.trackId);
    if (!Number.isInteger(trackId) || trackId < 1) return reply.code(400).send({ error: "trackId must be a track's number" });
    await recordListen(req.user!.id, trackId);
    return reply.code(204).send();
  });

  // A room boss beaten. Counted once per day.
  app.post("/api/monthly/run", { preHandler: requireAuth }, async (req, reply) => {
    await recordRun(req.user!.id);
    return reply.code(204).send();
  });

  app.get("/api/admin/monthly", { preHandler: requireAdmin }, async () => adminMonthly());

  // Writes the brief for one month. The three temporary briefs appear here as the starting text until saved.
  app.put<{ Params: { month: string }; Body: Record<string, unknown> }>("/api/admin/monthly/:month", { preHandler: requireAdmin }, async (req, reply) => {
    const month = req.params.month;
    if (!MONTH_RE.test(month)) return reply.code(400).send({ error: "the month must look like 2026-10" });
    const cleaned = cleanBossBody(req.body ?? {});
    if (!cleaned.ok) return reply.code(400).send({ error: cleaned.error });
    if (cleaned.value.trackId !== null && !(await prisma.track.findUnique({ where: { id: cleaned.value.trackId }, select: { id: true } }))) {
      return reply.code(400).send({ error: "no track has that number" });
    }
    await saveBoss(month, cleaned.value);
    return adminMonthly();
  });
}
