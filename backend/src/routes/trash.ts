import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { deleteMessageAttachments } from "../lib/attachmentCleanup.js";
import { daysLeft, trashCutoff } from "../lib/trash.js";
import { mergeInbox, type InboxItem } from "../lib/inbox.js";
import { decodeDocMeta, decodeTexMeta, docKindOf, LIBRARY_MAX } from "../lib/trashEntries.js";

/** Messages whose 30 days ran out: files go for good, the tombstone row stays (replies point at it). */
export async function sweepTrash(): Promise<number> {
  const old = await prisma.message.findMany({ where: { isDeleted: true, deletedAt: { lt: trashCutoff() } }, select: { id: true }, take: 200 });
  for (const m of old) {
    await deleteMessageAttachments(prisma, m.id).catch(() => undefined);
    await prisma.message.update({ where: { id: m.id }, data: { deletedAt: null, contentRaw: "" } });
  }
  // rooms, prefabs, themes and pictures that ran out their 30 days (P35)
  await prisma.trashEntry.deleteMany({ where: { deletedAt: { lt: trashCutoff() } } });
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

  // Rooms, prefabs, themes and pictures in the trash, newest first (P35).
  app.get("/api/admin/trash/items", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.trashEntry.findMany({ where: { deletedAt: { gte: trashCutoff() } }, orderBy: { deletedAt: "desc" }, take: 200, select: { id: true, kind: true, key: true, label: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, type: r.kind === "texture" ? "picture" : docKindOf(r.key), label: r.label, deletedAt: r.deletedAt.toISOString(), daysLeft: daysLeft(r.deletedAt) }));
  });

  // Restore: the room, prefab, theme or picture comes back as it was. A room gets its saved versions back too; a picture its own id.
  app.post<{ Params: { id: string } }>("/api/admin/trash/items/:id/restore", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const e = Number.isInteger(id) ? await prisma.trashEntry.findUnique({ where: { id } }) : null;
    if (!e || e.deletedAt < trashCutoff()) return reply.code(404).send({ error: "That is not in the trash any more." });
    try {
      if (e.kind === "doc") {
        if (!e.doc) return reply.code(409).send({ error: "Nothing to restore: the saved room is missing." });
        if (await prisma.roomDoc.findUnique({ where: { slug: e.key }, select: { id: true } })) return reply.code(409).send({ error: `${e.label} exists again. Rename or delete it first.` });
        const meta = decodeDocMeta(e.meta);
        await prisma.$transaction([
          prisma.roomDoc.create({ data: { slug: e.key, doc: e.doc, version: meta.version } }),
          prisma.roomDocVersion.createMany({ data: meta.history.map((h) => ({ slug: e.key, version: h.version, doc: h.doc, savedAt: new Date(h.savedAt) })) }),
          prisma.trashEntry.delete({ where: { id } }),
        ]);
      } else if (e.kind === "texture") {
        const m = decodeTexMeta(e.meta);
        if (!m || !e.png) return reply.code(409).send({ error: "This picture cannot be restored: its saved data is damaged." });
        if ((await prisma.textureAsset.count()) >= LIBRARY_MAX) return reply.code(409).send({ error: `The picture library is full (${LIBRARY_MAX}). Delete some first.` });
        if (await prisma.textureAsset.findUnique({ where: { id: m.id }, select: { id: true } })) return reply.code(409).send({ error: "Its id is taken now, so it cannot come back under the same id." });
        await prisma.$transaction([
          prisma.textureAsset.create({ data: { id: m.id, name: m.name, png: new Uint8Array(e.png), createdAt: new Date(m.createdAt) } }),
          prisma.trashEntry.delete({ where: { id } }),
        ]);
      } else return reply.code(409).send({ error: "This kind of item cannot be restored." });
    } catch {
      return reply.code(409).send({ error: "It was restored or removed a moment ago. Reload the trash." });
    }
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "trash.restore", targetType: "TrashEntry", targetId: id, meta: { kind: e.kind, key: e.key, label: e.label } } });
    return { ok: true };
  });

  // Delete now: the room, prefab, theme or picture can no longer be restored.
  app.post<{ Params: { id: string } }>("/api/admin/trash/items/:id/purge", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const e = Number.isInteger(id) ? await prisma.trashEntry.findUnique({ where: { id }, select: { kind: true, key: true, label: true } }) : null;
    if (!e) return reply.code(404).send({ error: "That is not in the trash any more." });
    await prisma.trashEntry.delete({ where: { id } }).catch(() => undefined);
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "trash.purge", targetType: "TrashEntry", targetId: id, meta: { kind: e.kind, key: e.key, label: e.label } } });
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
