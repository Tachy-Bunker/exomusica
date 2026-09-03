import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, hashPassword, verifyPassword } from "../lib/auth.js";
import { ghostifyUser } from "../services/accountService.js";
import { createNotification } from "../lib/notify.js";
import { saveSiteImage } from "../lib/storage.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Self view — includes email and notification prefs, unlike the public
  // /api/users/:username lookup which deliberately hides email.
  app.get("/api/account/followed-channels", { preHandler: requireAuth }, async (req) => {
    const follows = await prisma.channelFollow.findMany({
      where: { userId: req.user!.id },
      include: { channel: { select: { slug: true } } },
    });
    return follows.map((f) => f.channel.slug);
  });

  // Deliberately tighter than the site's general 10MB body limit — an
  // avatar has no reason to be that large, and a small explicit cap here
  // keeps profile pictures fast to load everywhere they're shown (header,
  // messages, profile).
  app.post(
    "/api/account/avatar",
    { preHandler: requireAuth, bodyLimit: 1024 * 1024 },
    async (req, reply) => {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        return reply.code(400).send({ error: "only JPG, PNG, or WEBP images are supported" });
      }
      const buffer = await file.toBuffer();
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "avatars");
      await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: url } });
      return { avatarUrl: url };
    },
  );

  app.get("/api/account/me", { preHandler: requireAuth }, async (req, reply) => {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { followedChannels: { include: { channel: { select: { slug: true, name: true } } } } },
    });
    if (!me) return reply.code(404).send({ error: "no such user" });
    return {
      id: me.id,
      username: me.username,
      email: me.email,
      bio: me.bio,
      links: me.links,
      volumeNotifications: me.volumeNotifications,
      volumeSfxIdle: me.volumeSfxIdle,
      volumeSfxPlaying: me.volumeSfxPlaying,
      volumeMusic: me.volumeMusic,
      caEnabled: me.caEnabled,
      moireEnabled: me.moireEnabled,
      notifyWeeklySummary: me.notifyWeeklySummary,
      notifyDailySummary: me.notifyDailySummary,
      notifyFollowedReplies: me.notifyFollowedReplies,
      notifyPrivateMessage: me.notifyPrivateMessage,
      notifyNews: me.notifyNews,
      notifyCallsForIdeas: me.notifyCallsForIdeas,
      notifyCallsForArtists: me.notifyCallsForArtists,
      followedChannels: me.followedChannels.map((f) => ({
        slug: f.channel.slug,
        name: f.channel.name,
        notifyOnReply: f.notifyOnReply,
      })),
    };
  });

  app.patch<{
    Body: Partial<{
      notifyWeeklySummary: boolean;
      notifyDailySummary: boolean;
      notifyFollowedReplies: boolean;
      notifyPrivateMessage: boolean;
      notifyNews: boolean;
      notifyCallsForIdeas: boolean;
      notifyCallsForArtists: boolean;
    }>;
  }>("/api/account/notifications", { preHandler: requireAuth }, async (req) => {
    return prisma.user.update({ where: { id: req.user!.id }, data: req.body ?? {} });
  });

  app.patch<{ Body: Partial<{ volumeNotifications: number; volumeSfxIdle: number; volumeSfxPlaying: number; volumeMusic: number }> }>(
    "/api/account/volume-mixer",
    { preHandler: requireAuth },
    async (req) => {
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      const data: Record<string, number> = {};
      if (req.body?.volumeNotifications !== undefined) data.volumeNotifications = clamp(req.body.volumeNotifications);
      if (req.body?.volumeSfxIdle !== undefined) data.volumeSfxIdle = clamp(req.body.volumeSfxIdle);
      if (req.body?.volumeSfxPlaying !== undefined) data.volumeSfxPlaying = clamp(req.body.volumeSfxPlaying);
      if (req.body?.volumeMusic !== undefined) data.volumeMusic = clamp(req.body.volumeMusic);
      return prisma.user.update({ where: { id: req.user!.id }, data });
    },
  );

  app.patch<{ Body: Partial<{ caEnabled: boolean; moireEnabled: boolean }> }>(
    "/api/account/visual-effects",
    { preHandler: requireAuth },
    async (req) => {
      return prisma.user.update({ where: { id: req.user!.id }, data: req.body ?? {} });
    },
  );

  app.patch<{ Body: Partial<{ bio: string; links: { label: string; url: string }[] }> }>(
    "/api/account/profile",
    { preHandler: requireAuth },
    async (req) => {
      return prisma.user.update({ where: { id: req.user!.id }, data: req.body ?? {} });
    },
  );

  // Per-topic override under the global notifyFollowedReplies toggle.
  app.patch<{ Params: { slug: string }; Body: { notifyOnReply: boolean } }>(
    "/api/channels/:slug/follow/notifications",
    { preHandler: requireAuth },
    async (req, reply) => {
      const channel = await prisma.forumChannel.findUnique({ where: { slug: req.params.slug } });
      if (!channel) return reply.code(404).send({ error: "no such channel" });
      await prisma.channelFollow.update({
        where: { userId_channelId: { userId: req.user!.id, channelId: channel.id } },
        data: { notifyOnReply: req.body?.notifyOnReply ?? true },
      });
      return reply.code(204).send();
    },
  );

  app.patch<{ Body: { currentPassword: string; newPassword: string } }>(
    "/api/account/password",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: "currentPassword and newPassword are required" });
      }
      const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!me?.passwordHash || !(await verifyPassword(me.passwordHash, currentPassword))) {
        return reply.code(401).send({ error: "current password is incorrect" });
      }
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      void createNotification(req.user!.id, "account_updated", "Password changed", "Your password was updated.").catch((err) =>
        app.log.error(err, "createNotification failed"),
      );
      return { status: "updated" };
    },
  );

  // Public profile — everything except email (spec: accounts can see each
  // other's info except email).
  app.get<{ Params: { id: string } }>("/api/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        links: true,
        isAdmin: true,
        isGhost: true,
        createdAt: true,
      },
    });
    if (!user) return reply.code(404).send({ error: "no such user" });
    return user;
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ username: string; bio: string; links: Record<string, string>; isAdmin: boolean }>;
  }>("/api/admin/users/:id", { preHandler: requireAdmin }, async (req) => {
    return prisma.user.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
  });

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/avatar", { preHandler: requireAdmin, bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return reply.code(400).send({ error: "only JPG, PNG, or WEBP images are supported" });
    }
    const buffer = await file.toBuffer();
    const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "avatars");
    await prisma.user.update({ where: { id: Number(req.params.id) }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  });

  app.get<{ Querystring: { q?: string; ghostsOnly?: string } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req) => {
      const { q, ghostsOnly } = req.query;
      const users = await prisma.user.findMany({
        where: {
          ...(q ? { username: { contains: q, mode: "insensitive" } } : {}),
          ...(ghostsOnly === "true" ? { isGhost: true } : {}),
        },
        select: {
          id: true,
          username: true,
          isAdmin: true,
          isGhost: true,
          discordId: true,
          linkedUserId: true,
          linkedUser: { select: { id: true, username: true } },
          createdAt: true,
          _count: { select: { messages: true } },
        },
        orderBy: { username: "asc" },
        take: ghostsOnly === "true" ? undefined : 50,
      });
      // Active, then linked ghosts, then unlinked ghosts — alphabetical
      // within each group. Whether a ghost is linked isn't a plain scalar
      // column Prisma can sort on directly, so rank it here instead.
      const rank = (u: (typeof users)[number]) => (!u.isGhost ? 0 : u.linkedUserId ? 1 : 2);
      users.sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));
      return users;
    },
  );

  app.post<{ Params: { id: string }; Body: { targetUserId: number } }>(
    "/api/admin/users/:id/link-ghost",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const ghostId = Number(req.params.id);
      const { targetUserId } = req.body ?? {};
      if (!targetUserId) return reply.code(400).send({ error: "targetUserId is required" });
      if (ghostId === targetUserId) return reply.code(400).send({ error: "can't link a ghost to itself" });

      const ghost = await prisma.user.findUnique({ where: { id: ghostId } });
      if (!ghost || !ghost.isGhost) return reply.code(400).send({ error: "not a ghost account" });
      const target = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!target) return reply.code(404).send({ error: "target account not found" });

      // Deliberately NOT reassigning message.authorId — this is a
      // persistent link, resolved at read time (message display, export,
      // mentions) rather than a one-time backfill. That's what makes it
      // safe to relink/unlink later, and what makes a future Discord bot
      // bridge work: new messages can keep arriving tagged with this
      // discordId's ghost, and every reader resolves through the link to
      // the real account automatically — no per-message reassignment
      // needed going forward.
      await prisma.user.update({ where: { id: ghostId }, data: { linkedUserId: targetUserId } });
      return { status: "linked" };
    },
  );

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/unlink-ghost", { preHandler: requireAdmin }, async (req, reply) => {
    const ghostId = Number(req.params.id);
    const ghost = await prisma.user.findUnique({ where: { id: ghostId } });
    if (!ghost || !ghost.isGhost) return reply.code(400).send({ error: "not a ghost account" });
    await prisma.user.update({ where: { id: ghostId }, data: { linkedUserId: null } });
    return { status: "unlinked" };
  });

  // Bulk lookup for mentions in imported content, which store a raw
  // Discord snowflake (<@123456789>) rather than a username. Resolves
  // through the ghost link when one is set, so a mention that says
  // "@<ghost's discord id>" in old message text shows the linked real
  // account's current username — without ever rewriting the message.
  app.get<{ Querystring: { ids?: string } }>("/api/users/discord-lookup", async (req) => {
    const ids = (req.query.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { discordId: { in: ids } },
      select: { discordId: true, username: true, avatarUrl: true, isGhost: true, linkedUser: { select: { username: true, avatarUrl: true } } },
    });
    return users.map((u) => ({
      discordId: u.discordId,
      username: u.isGhost && u.linkedUser ? u.linkedUser.username : u.username,
      avatarUrl: u.isGhost && u.linkedUser ? u.linkedUser.avatarUrl : u.avatarUrl,
    }));
  });

  app.get<{ Params: { username: string } }>("/api/users/:username", async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        links: true,
        isGhost: true,
        createdAt: true,
      },
    });
    if (!user) return reply.code(404).send({ error: "no such user" });
    return user;
  });

  app.delete("/api/account", { preHandler: requireAuth }, async (req) => {
    await ghostifyUser(req.user!.id);
    return { status: "ghosted" };
  });

  // Admin equivalent, for moderation rather than self-service.
  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req) => {
      const targetId = Number(req.params.id);
      await ghostifyUser(targetId);
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: "user.moderate_delete", targetType: "User", targetId },
      });
      return { status: "ghosted" };
    },
  );
}
