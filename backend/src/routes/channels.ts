import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { BACKUP_FORMAT, messageKey, parseBackup, type BackupFile } from "../lib/topicBackup.js";
import { toDayKey } from "../lib/dayKey.js";
import { deleteAttachmentAndReclaim } from "../lib/storage.js";

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { kind?: "BRANCH" | "DISCUSSION" } }>("/api/channels", async (req) => {
    return prisma.forumChannel.findMany({
      where: req.query.kind ? { kind: req.query.kind } : undefined,
      include: { font: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  });

  app.get<{ Params: { slug: string } }>("/api/channels/:slug", async (req, reply) => {
    const channel = await prisma.forumChannel.findUnique({
      where: { slug: req.params.slug },
      include: { branch: { select: { slug: true, name: true } }, font: true },
    });
    if (!channel) return reply.code(404).send({ error: "no such channel" });
    return channel;
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      description: string;
      contentMarkdown: string;
      category: string;
      position: number;
      fontId: number | null;
      discordChannelId: string | null;
      discordWebhookUrl: string | null;
      ogTitle: string | null;
      ogDescription: string | null;
      ogImageUrl: string | null;
    }>;
  }>("/api/admin/channels/:id", { preHandler: requireAdmin }, async (req) => {
    return prisma.forumChannel.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
  });

  // Powers the "follow" button - ChannelFollow already existed (it's what
  // weeklySummary.ts reads from) but nothing ever wrote to it.
  app.post<{ Params: { slug: string } }>(
    "/api/channels/:slug/follow",
    { preHandler: requireAuth },
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });
      await prisma.channelFollow.upsert({
        where: { userId_channelId: { userId: req.user!.id, channelId: channel.id } },
        create: { userId: req.user!.id, channelId: channel.id },
        update: {},
      });
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { slug: string } }>(
    "/api/channels/:slug/follow",
    { preHandler: requireAuth },
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });
      await prisma.channelFollow.deleteMany({ where: { userId: req.user!.id, channelId: channel.id } });
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { slug: string } }>(
    "/api/channels/:slug/follow",
    { preHandler: requireAuth },
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });
      const follow = await prisma.channelFollow.findUnique({
        where: { userId_channelId: { userId: req.user!.id, channelId: channel.id } },
      });
      return { following: !!follow };
    },
  );

  // Discussion topics (Art You Like, Science, Primal Taste Theory, ...) have
  // no branch - branch topics come from POST /api/admin/branches instead.
  app.post<{ Body: { slug: string; name: string; description?: string; category?: string } }>(
    "/api/admin/channels",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { slug, name, description, category } = req.body ?? {};
      if (!slug || !name) {
        return reply.code(400).send({ error: "slug and name are required" });
      }
      const channel = await prisma.forumChannel.create({
        data: { slug, name, description, category, kind: "DISCUSSION" },
      });
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: "channel.create", targetType: "ForumChannel", targetId: channel.id },
      });
      return reply.code(201).send(channel);
    },
  );

  // ---- Backup, restore and delete (discussion topics only; branch chats live and die with their branch) ----

  // ?ids=1,2,3 for a selection, ?all=1 for every discussion topic. One id = one topic.
  app.get<{ Querystring: { ids?: string; all?: string } }>("/api/admin/topics/export", { preHandler: requireAdmin }, async (req, reply) => {
    const ids = (req.query.ids ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!req.query.all && ids.length === 0) return reply.code(400).send({ error: "pick topics (ids) or all=1" });
    const topics = await prisma.forumChannel.findMany({
      where: { kind: "DISCUSSION", ...(req.query.all ? {} : { id: { in: ids } }) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        slug: true, name: true, description: true, category: true, position: true, contentMarkdown: true, ogTitle: true, ogDescription: true, ogImageUrl: true,
        messages: {
          where: { isDeleted: false }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, createdAt: true, replyToId: true, contentRaw: true, editedAt: true, importedFrom: true, author: { select: { username: true, isGhost: true, linkedUser: { select: { username: true } } } } },
        },
      },
    });
    const file: BackupFile = {
      format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(),
      topics: topics.map((t) => ({
        ...t,
        messages: t.messages.map((m) => ({
          id: m.id, author: m.author.username, at: m.createdAt.toISOString(), replyTo: m.replyToId, text: m.contentRaw,
          edited: m.editedAt?.toISOString() ?? null, importedFrom: m.importedFrom,
        })),
      })),
    };
    const name = topics.length === 1 ? topics[0].slug : "topics";
    reply.header("content-disposition", `attachment; filename="exomusica-${name}-${file.exportedAt.slice(0, 10)}.json"`);
    return file;
  });

  // Creates missing topics; for an existing slug it only adds messages that are not already there. Never overwrites or deletes.
  app.post<{ Body: { data: unknown; only?: string[] } }>("/api/admin/topics/import", { preHandler: requireAdmin }, async (req, reply) => {
    let topics;
    try { topics = parseBackup(req.body?.data); } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
    const only = Array.isArray(req.body?.only) ? new Set(req.body.only) : null;
    const results: { slug: string; created: boolean; added: number; skipped: number }[] = [];
    const userIds = new Map<string, number>();
    const userId = async (username: string): Promise<number> => {
      const hit = userIds.get(username);
      if (hit) return hit;
      let u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (!u) u = await prisma.user.create({ data: { username, isGhost: true }, select: { id: true } }); // an account that no longer exists keeps its name
      userIds.set(username, u.id);
      return u.id;
    };
    for (const t of topics) {
      if (only && !only.has(t.slug)) continue;
      let channel = await prisma.forumChannel.findUnique({ where: { slug: t.slug }, select: { id: true, kind: true } });
      if (channel && channel.kind !== "DISCUSSION") { results.push({ slug: t.slug, created: false, added: 0, skipped: t.messages.length }); continue; }
      const created = !channel;
      if (!channel) {
        channel = await prisma.forumChannel.create({
          data: { slug: t.slug, name: t.name, description: t.description, category: t.category, position: t.position, contentMarkdown: t.contentMarkdown, ogTitle: t.ogTitle, ogDescription: t.ogDescription, ogImageUrl: t.ogImageUrl, kind: "DISCUSSION" },
          select: { id: true, kind: true },
        });
      }
      const have = new Set((await prisma.message.findMany({ where: { channelId: channel.id }, select: { authorId: true, createdAt: true, contentRaw: true } })).map((m) => messageKey(m.authorId, m.createdAt, m.contentRaw)));
      const fresh: { m: (typeof t.messages)[number]; authorId: number }[] = [];
      for (const m of t.messages) {
        const authorId = await userId(m.author);
        const k = messageKey(authorId, m.at, m.text);
        if (have.has(k)) continue;
        have.add(k);
        fresh.push({ m, authorId });
      }
      if (fresh.length) {
        await prisma.message.createMany({
          skipDuplicates: true,
          data: fresh.map(({ m, authorId }) => ({
            channelId: channel!.id, authorId, createdAt: new Date(m.at), dayKey: toDayKey(new Date(m.at)), contentRaw: m.text,
            editedAt: m.edited ? new Date(m.edited) : null, importedFrom: m.importedFrom,
          })),
        });
        // Replies: link by (author, time, text) of the parent, because new rows have new ids.
        const rows = await prisma.message.findMany({ where: { channelId: channel.id }, select: { id: true, authorId: true, createdAt: true, contentRaw: true } });
        const idByKey = new Map(rows.map((r) => [messageKey(r.authorId, r.createdAt, r.contentRaw), r.id]));
        const byBackupId = new Map(t.messages.map((m) => [m.id, m]));
        for (const { m, authorId } of fresh) {
          const parent = m.replyTo !== null ? byBackupId.get(m.replyTo) : undefined;
          if (!parent) continue;
          const pid = idByKey.get(messageKey(await userId(parent.author), parent.at, parent.text));
          const self = idByKey.get(messageKey(authorId, m.at, m.text));
          if (pid && self && pid !== self) await prisma.message.update({ where: { id: self }, data: { replyToId: pid } });
        }
      }
      results.push({ slug: t.slug, created, added: fresh.length, skipped: t.messages.length - fresh.length });
    }
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "channel.import", targetType: "ForumChannel", targetId: 0 } });
    return { results };
  });

  // Removes the topic with its messages, reactions, bookmarks, follows and map node. Files attached to its messages are deleted too.
  app.delete<{ Params: { id: string } }>("/api/admin/channels/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const channel = await prisma.forumChannel.findUnique({ where: { id }, select: { id: true, kind: true } });
    if (!channel) return reply.code(404).send({ error: "no such topic" });
    if (channel.kind !== "DISCUSSION") return reply.code(400).send({ error: "Branch chats are removed by deleting the branch" });
    const files = await prisma.attachment.findMany({ where: { message: { channelId: id } }, select: { id: true } });
    for (const f of files) await deleteAttachmentAndReclaim(f.id);
    await prisma.message.updateMany({ where: { channelId: id }, data: { replyToId: null } }); // replies point at each other; the cascade needs them free
    await prisma.forumChannel.delete({ where: { id } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "channel.delete", targetType: "ForumChannel", targetId: id } });
    return reply.code(204).send();
  });
}
