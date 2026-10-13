import type { Prisma } from "@prisma/client";

export interface AuditQuery { q?: string; actor?: string; action?: string; from?: string; to?: string }

const day = (s?: string, end = false): Date | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(+d)) return null;
  return end ? new Date(+d + 86_400_000) : d;
};

/** Free text matches action / target / admin; the others narrow further. Dates are UTC days, `to` inclusive. */
export function auditWhere(q: AuditQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  const text = q.q?.trim();
  if (text) and.push({ OR: [{ action: { contains: text, mode: "insensitive" } }, { targetType: { contains: text, mode: "insensitive" } }, { actor: { username: { contains: text, mode: "insensitive" } } }] });
  if (q.actor?.trim()) and.push({ actor: { username: { equals: q.actor.trim(), mode: "insensitive" } } });
  if (q.action?.trim()) and.push({ action: { startsWith: q.action.trim() } });
  const from = day(q.from), to = day(q.to, true);
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  return and.length ? { AND: and } : {};
}
