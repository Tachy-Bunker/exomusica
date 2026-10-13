import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { deleteMessageAttachments } from "../lib/attachmentCleanup.js";
import { daysLeft, trashCutoff } from "../lib/trash.js";
import { mergeInbox, type InboxItem } from "../lib/inbox.js";

/** Messages whose 30 days ran out: files go for good, the tombstone row stays (replies point at it). */
export async function sweepTrash(): Promise<number> {
  const old = await prisma.message.findMany({ where: { isDeleted: true, deletedAt: { lt: trashCutoff() } }, select: { id: true }, take: 200 });
  for (const m of old) {
    await deleteMessageAttachments(prisma, m.id).catch(() => undefined);
    await prisma.message.update({ where: { id: m.id }, data: { deletedAt: null, contentRaw: "" } });
  }
  return old.length;
}

export async function trashRoutes(app: FastifyInstance): Promise<void> {
  const timer = setInterval(() => { void sweepTrash().catch((err) => app.log.warn({ err }, "trash sweep failed")); }, 3_600_000);
  timer.unref();

  app.get("/api/admin/trash", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.message.findMany({
      where: { isDeleted: true, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 200,
      select: { id: true, contentRaw: true, deletedAt: true, kind: true, author: { select: { username: true } }, channel: { select: { slug: true, name: true } }, _count: { select: { attachments: true } } },
    });
    return rows.map((r) => ({ id: r.id, text: r.contentRaw.slice(0, 200), kind: r.kind, author: r.author.username, channel: r.channel, files: r._count.attachments, deletedAt: r.deletedAt!.toISOString(), daysLeft: daysLeft(r.deletedAt!) }));
  });

  // Purge now: files go immediately, the message can no longer be restored.
  app.post<{ Params: { id: string } }>("/api/admin/trash/:id/purge", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const m = await prisma.message.findUnique({ where: { id }, select: { isDeleted: true, deletedAt: true } });
    if (!m || !m.isDeleted || !m.deletedAt) return reply.code(404).send({ error: "not in the trash" });
    await deleteMessageAttachments(prisma, id).catch(() => undefined);
    await prisma.message.update({ where: { id }, data: { deletedAt: null, contentRaw: "" } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "message.purge", targetType: "Message", targetId: id } });
    return { ok: true };
  });

  // One list of everything waiting on a person, longest wait first. The nav badge reads `total`.
  app.get("/api/admin/inbox", { preHandler: requireAdmin }, async () => {
    const [joins, subs, claims] = await Promise.all([
      prisma.joinRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, username: true, reason: true, createdAt: true } }),
      prisma.communityAlbum.findMany({ where: { submissionStatus: "PENDING" }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, title: true, createdAt: true, owner: { select: { username: true } }, targetBranch: { select: { name: true } }, _count: { select: { tracks: true } } } }),
      prisma.rewardClaim.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, createdAt: true, user: { select: { username: true } }, reward: { select: { title: true } } } }),
    ]);
    const [nj, ns, nc] = await Promise.all([
      prisma.joinRequest.count({ where: { status: "PENDING" } }),
      prisma.communityAlbum.count({ where: { submissionStatus: "PENDING" } }),
      prisma.rewardClaim.count({ where: { status: "pending" } }),
    ]);
    const items = mergeInbox([
      joins.map((j): InboxItem => ({ kind: "join", id: j.id, title: j.reason.slice(0, 120), who: j.username, at: +j.createdAt, to: "/admin/join-requests" })),
      subs.filter((a) => a._count.tracks > 0).map((a): InboxItem => ({ kind: "submission", id: a.id, title: `${a.title} → ${a.targetBranch?.name ?? "?"}`, who: a.owner.username, at: +a.createdAt, to: "/admin/submissions" })),
      claims.map((c): InboxItem => ({ kind: "reward", id: c.id, title: c.reward.title, who: c.user.username, at: +c.createdAt, to: "/admin/rewards" })),
    ]);
    return { total: nj + ns + nc, counts: { join: nj, submission: ns, reward: nc }, items };
  });
}
