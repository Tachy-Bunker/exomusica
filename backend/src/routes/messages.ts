import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { toDayKey } from "../lib/dayKey.js";
import { toMessageDTO } from "../lib/messageDto.js";
import { broadcast } from "../lib/chatHub.js";
import { sendTemplatedMail } from "../lib/emailTemplates.js";
import { createNotification } from "../lib/notify.js";
import { parseSearchQuery } from "../lib/searchQuery.js";
import { walkChannelHistoryInChunks } from "../lib/messageChunking.js";
import { forwardMessageToDiscord, sendDiscordDM } from "../lib/discordBot.js";

const messageInclude = {
  author: { select: { username: true, avatarUrl: true, isGhost: true, linkedUserId: true, linkedUser: { select: { username: true, avatarUrl: true } } } },
  reactions: { include: { emoji: true, user: { select: { username: true } } } },
  attachments: true,
  replyTo: { select: { id: true, contentRaw: true, author: { select: { username: true } } } },
} as const;

interface MessageQuery {
  day?: string; // YYYY-MM-DD — archived-day view
  before?: string; // message id cursor — live feed pagination
  q?: string; // search string — scoped to this channel
  limit?: string;
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string }; Querystring: MessageQuery }>(
    "/api/channels/:slug/messages",
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });

      const limit = Math.min(Number(req.query.limit ?? 100), 300);
      const { day, before, q } = req.query;

      // --- search: scoped to this channel, most recent match first --------
      if (q) {
        const parsed = parseSearchQuery(q);

        const textSearchIds = parsed.text
          ? (
              await prisma.$queryRaw<{ id: number }[]>`
                SELECT id FROM "Message"
                WHERE "channelId" = ${channel.id}
                  AND "isDeleted" = false
                  AND to_tsvector('english', "contentRaw") @@ plainto_tsquery('english', ${parsed.text})
                ORDER BY "createdAt" DESC
                LIMIT ${limit}
              `
            ).map((r) => r.id)
          : null;
        if (textSearchIds && textSearchIds.length === 0) return []; // free text matched nothing — has:/from: can't narrow further

        const author = parsed.fromUsername ? await prisma.user.findUnique({ where: { username: parsed.fromUsername } }) : null;
        if (parsed.fromUsername && !author) return []; // named user doesn't exist — no point querying

        const hasConditions = parsed.hasFilters.map((h) => {
          if (h === "link") return { contentRaw: { contains: "http" } };
          if (h === "sound") {
            return {
              OR: [{ attachments: { some: { mimeType: { startsWith: "audio/" } } } }, { contentRaw: { contains: "track:" } }],
            };
          }
          return { attachments: { some: { mimeType: { startsWith: `${h}/` } } } }; // image/ or video/
        });

        const messages = await prisma.message.findMany({
          where: {
            channelId: channel.id,
            isDeleted: false,
            ...(textSearchIds ? { id: { in: textSearchIds } } : {}),
            ...(author ? { authorId: author.id } : {}),
            ...(hasConditions.length > 0 ? { AND: hasConditions } : {}),
          },
          include: messageInclude,
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        return Promise.all(messages.map(toMessageDTO));
      }

      // --- archived day view: the whole day, chronological ----------------
      if (day) {
        const dayKey = toDayKey(new Date(day));
        const messages = await prisma.message.findMany({
          where: { channelId: channel.id, dayKey },
          include: messageInclude,
          orderBy: { createdAt: "asc" },
        });
        return Promise.all(messages.map(toMessageDTO));
      }

      // --- live feed: most recent first, paginate backward with `before` --
      // Uses Prisma's cursor+skip pagination (paginate by *position in the
      // requested order*) rather than "WHERE id < before" — a raw id
      // comparison would silently break once a channel has Discord history
      // backfilled into it, since those imported rows get higher ids than
      // their (older) createdAt timestamps.
      const messages = await prisma.message.findMany({
        where: { channelId: channel.id },
        include: messageInclude,
        orderBy: { createdAt: "desc" },
        take: limit,
        ...(before ? { cursor: { id: Number(before) }, skip: 1 } : {}),
      });
      const dtos = await Promise.all(messages.map(toMessageDTO));
      return dtos.reverse(); // oldest-first for display
    },
  );

  // Site-wide, any channel, regardless of follow status — powers the
  // notification widget's "recent activity" section and the client-side
  // check for whether an unfollowed-topic message deserves a sound.
  app.get<{ Querystring: { limit?: string } }>("/api/recent-messages", async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 3), 20);
    const messages = await prisma.message.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { author: { select: { username: true } }, channel: { select: { slug: true, name: true } } },
    });
    return messages.map((m) => ({
      id: m.id,
      channelSlug: m.channel.slug,
      channelName: m.channel.name,
      authorUsername: m.author.username,
      excerpt: m.contentRaw.slice(0, 120),
      unixTimestamp: Math.floor(m.createdAt.getTime() / 1000),
    }));
  });

  // Distinct authors in this channel — powers the from: search autocomplete.
  app.get<{ Params: { slug: string } }>("/api/channels/:slug/participants", async (req, reply) => {
    const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
    if (!channel) return reply.code(404).send({ error: "no such channel" });
    const rows = await prisma.message.findMany({
      where: { channelId: channel.id, isDeleted: false },
      select: { author: { select: { username: true } } },
      distinct: ["authorId"],
    });
    return rows.map((r) => r.author.username);
  });

  app.get("/api/channels/:slug/archive", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const channel = await prisma.forumChannel.findUnique({ where: { slug } });
    if (!channel) return reply.code(404).send({ error: "no such channel" });

    // groupBy only returns dayKeys that actually have messages, so empty
    // days never show up in the calendar — no pruning job needed.
    const days = await prisma.message.groupBy({
      by: ["dayKey"],
      where: { channelId: channel.id, isDeleted: false },
      _count: { id: true },
      orderBy: { dayKey: "desc" },
    });
    return days.map((d) => ({ day: d.dayKey.toISOString().slice(0, 10), messageCount: d._count.id }));
  });

  app.post<{ Params: { slug: string }; Body: { contentRaw: string; replyToId?: number; attachmentIds?: number[] } }>(
    "/api/channels/:slug/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { contentRaw, replyToId, attachmentIds } = req.body ?? {};
      if (!contentRaw?.trim() && (!attachmentIds || attachmentIds.length === 0)) {
        return reply.code(400).send({ error: "contentRaw or at least one attachment is required" });
      }

      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });

      const now = new Date();
      const message = await prisma.message.create({
        data: {
          channelId: channel.id,
          authorId: req.user!.id,
          createdAt: now,
          dayKey: toDayKey(now),
          replyToId: replyToId ?? null,
          contentRaw,
        },
      });

      if (attachmentIds && attachmentIds.length > 0) {
        // Only attach files this user uploaded and that aren't already
        // claimed by another message — prevents linking someone else's
        // upload, or the same upload, into two messages.
        await prisma.attachment.updateMany({
          where: { id: { in: attachmentIds }, uploaderId: req.user!.id, messageId: null },
          data: { messageId: message.id },
        });
      }

      // Posting in a topic implies interest in it — auto-follow so replies
      // trigger the normal email/notification path. upsert rather than
      // create so this is a no-op if they already follow it.
      await prisma.channelFollow.upsert({
        where: { userId_channelId: { userId: req.user!.id, channelId: channel.id } },
        create: { userId: req.user!.id, channelId: channel.id },
        update: {},
      });

      const full = await prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: messageInclude });
      const dto = await toMessageDTO(full);
      broadcast(channel.slug, { type: "message.create", message: dto });
      void forwardMessageToDiscord(channel.slug, dto.authorUsername, contentRaw);

      // Fire-and-forget: followers who want replies on this specific topic
      // (global notifyFollowedReplies AND this follow's own notifyOnReply,
      // both default true), excluding whoever just posted.
      void (async () => {
        const followers = await prisma.channelFollow.findMany({
          where: { channelId: channel.id, notifyOnReply: true, userId: { not: req.user!.id } },
          include: { user: true },
        });
        for (const f of followers) {
          if (f.user.isGhost) continue;
          void createNotification(
            f.userId,
            "message_followed_topic",
            `New activity in ${channel.name}`,
            `${full.author.username}: ${contentRaw.slice(0, 120)}`,
            { channelSlug: channel.slug, messageId: message.id },
          ).catch((err) => app.log.error(err, "createNotification failed"));
          if (f.user.notifyFollowedReplies && f.user.email) {
            void sendTemplatedMail("TOPIC_REPLY", f.user.email, f.user.username, {
              channelName: channel.name,
              authorUsername: full.author.username,
              messageExcerpt: contentRaw.slice(0, 200),
              messageUrl: `https://exomusica.com/topic/${channel.slug}#m-${message.id}`,
            }).catch((err) => app.log.error(err, "sendTemplatedMail failed"));
          }
          if (f.user.notifyDiscordFollowedReplies && f.user.discordUsername) {
            void sendDiscordDM(
              f.user.discordUsername,
              `New activity in ${channel.name} — ${full.author.username}: ${contentRaw.slice(0, 150)}\nhttps://exomusica.com/topic/${channel.slug}#m-${message.id}`,
            );
          }
        }
      })().catch((err) => app.log.error(err, "follower-notification background task failed"));

      return reply.code(201).send(dto);
    },
  );

  app.patch<{ Params: { id: string }; Body: { contentRaw: string } }>(
    "/api/messages/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const contentRaw = req.body?.contentRaw;
      if (!contentRaw?.trim()) return reply.code(400).send({ error: "contentRaw is required" });
      const id = Number(req.params.id);
      const existing = await prisma.message.findUnique({ where: { id }, include: { channel: true } });
      if (!existing || existing.isDeleted) return reply.code(404).send({ error: "no such message" });
      if (existing.authorId !== req.user!.id && !req.user!.isAdmin) {
        return reply.code(403).send({ error: "not your message" });
      }
      const updated = await prisma.message.update({
        where: { id },
        data: { contentRaw, editedAt: new Date() },
        include: messageInclude,
      });
      const dto = await toMessageDTO(updated);
      broadcast(existing.channel.slug, { type: "message.update", message: dto });
      return dto;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = await prisma.message.findUnique({ where: { id }, include: { channel: true } });
      if (!existing || existing.isDeleted) return reply.code(404).send({ error: "no such message" });
      const isOwnMessage = existing.authorId === req.user!.id;
      if (!isOwnMessage && !req.user!.isAdmin) {
        return reply.code(403).send({ error: "not your message" });
      }
      await prisma.message.update({ where: { id }, data: { isDeleted: true } });
      if (!isOwnMessage) {
        await prisma.auditLog.create({
          data: { actorId: req.user!.id, action: "message.moderate_delete", targetType: "Message", targetId: id },
        });
      }
      broadcast(existing.channel.slug, { type: "message.delete", messageId: id });
      return reply.code(204).send();
    },
  );

  // Full chat export — walks the whole channel history in chunks of 300
  // (never loads it all into memory at once) and returns a plain-text
  // file: one line per message, "YYYY-MM-DD-HH-MM-SS:username:message".
  app.get<{ Params: { slug: string } }>("/api/channels/:slug/export", { preHandler: requireAuth }, async (req, reply) => {
    const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
    if (!channel) return reply.code(404).send({ error: "not found" });

    const lines: string[] = [];
    await walkChannelHistoryInChunks(prisma, channel.id, async (batch) => {
      const full = await prisma.message.findMany({
        where: { id: { in: batch.map((m) => m.id) } },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { username: true, isGhost: true, linkedUser: { select: { username: true } } } } },
      });
      for (const m of full) {
        if (m.isDeleted) continue;
        const ts = m.createdAt.toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
        const text = m.contentRaw.replace(/\n/g, " ");
        const username = m.author.isGhost && m.author.linkedUser ? m.author.linkedUser.username : m.author.username;
        lines.push(`${ts}:${username}:${text}`);
      }
    });

    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${req.params.slug}-export.txt"`);
    return lines.join("\n");
  });

  // Attachment list for the export — the export itself is plain text, so
  // attachments are handed back as a flat list of URLs/filenames for the
  // user to download individually rather than bundling a zip server-side.
  app.get<{ Params: { slug: string } }>("/api/channels/:slug/export/attachments", { preHandler: requireAuth }, async (req, reply) => {
    const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
    if (!channel) return reply.code(404).send({ error: "not found" });

    const attachments: { filename: string; url: string; createdAt: string }[] = [];
    await walkChannelHistoryInChunks(prisma, channel.id, async (batch) => {
      const full = await prisma.message.findMany({
        where: { id: { in: batch.map((m) => m.id) }, isDeleted: false },
        orderBy: { createdAt: "asc" },
        include: { attachments: true },
      });
      for (const m of full) {
        for (const a of m.attachments) {
          attachments.push({ filename: a.filename, url: a.storagePath, createdAt: m.createdAt.toISOString() });
        }
      }
    });
    return attachments;
  });
}
