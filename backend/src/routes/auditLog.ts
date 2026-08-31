import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    "/api/admin/audit-log",
    { preHandler: requireAdmin },
    async (req) => {
      const { q } = req.query;
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      return prisma.auditLog.findMany({
        where: q
          ? {
              OR: [
                { action: { contains: q, mode: "insensitive" } },
                { targetType: { contains: q, mode: "insensitive" } },
                { actor: { username: { contains: q, mode: "insensitive" } } },
              ],
            }
          : undefined,
        include: { actor: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    },
  );

  // Deliberately a real, irreversible clear — this is a log, not data
  // anyone's account is attributed by; nothing else references these rows.
  app.delete("/api/admin/audit-log", { preHandler: requireAdmin }, async (req) => {
    const result = await prisma.auditLog.deleteMany({});
    return { deleted: result.count };
  });
}
