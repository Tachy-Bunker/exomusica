import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { auditWhere, type AuditQuery } from "../lib/auditFilter.js";
import { csvRow } from "../lib/csv.js";

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: AuditQuery & { limit?: string } }>("/api/admin/audit-log", { preHandler: requireAdmin }, async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    return prisma.auditLog.findMany({
      where: auditWhere(req.query),
      include: { actor: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  });

  // The same filters as the list, streamed as a spreadsheet-safe CSV (capped so a huge log can't stall the server).
  app.get<{ Querystring: AuditQuery }>("/api/admin/audit-log.csv", { preHandler: requireAdmin }, async (req, reply) => {
    const rows = await prisma.auditLog.findMany({ where: auditWhere(req.query), include: { actor: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 20000 });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="action-log.csv"');
    return [csvRow(["when_utc", "admin", "action", "target_type", "target_id", "details"]), ...rows.map((r) => csvRow([r.createdAt.toISOString(), r.actor.username, r.action, r.targetType, r.targetId, r.meta ? JSON.stringify(r.meta) : ""]))].join("\n") + "\n";
  });

  // Deliberately a real, irreversible clear - this is a log, not data
  // anyone's account is attributed by; nothing else references these rows.
  app.delete("/api/admin/audit-log", { preHandler: requireAdmin }, async () => {
    const result = await prisma.auditLog.deleteMany({});
    return { deleted: result.count };
  });
}
