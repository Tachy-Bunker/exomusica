import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function contributorPointsRoutes(app: FastifyInstance): Promise<void> {
  // Admin-only leaderboard: total points per user, most first.
  app.get("/api/admin/contributor-points", { preHandler: requireAdmin }, async () => {
    const entries = await prisma.contributorPointsEntry.findMany({
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
    const totals = new Map<number, { username: string; total: number }>();
    for (const e of entries) {
      const t = totals.get(e.userId) ?? { username: e.user.username, total: 0 };
      t.total += e.points;
      totals.set(e.userId, t);
    }
    return {
      totals: [...totals.entries()].map(([userId, t]) => ({ userId, ...t })).sort((a, b) => b.total - a.total),
      entries,
    };
  });

  app.post<{ Body: { userId: number; points: number; reason: string } }>(
    "/api/admin/contributor-points",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { userId, points, reason } = req.body ?? {};
      if (!userId || !points || !reason?.trim()) return reply.code(400).send({ error: "userId, points, and reason are required" });
      const entry = await prisma.contributorPointsEntry.create({
        data: { userId, points, reason: reason.trim(), awardedById: req.user!.id },
      });
      return reply.code(201).send(entry);
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/contributor-points/:id", { preHandler: requireAdmin }, async (req) => {
    await prisma.contributorPointsEntry.delete({ where: { id: Number(req.params.id) } });
    return { ok: true };
  });
}
