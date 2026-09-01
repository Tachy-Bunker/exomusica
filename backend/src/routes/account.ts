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

  app.get<{ Querystring: { q?: string } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req) => {
      const { q } = req.query;
      return prisma.user.findMany({
        where: q ? { username: { contains: q, mode: "insensitive" } } : undefined,
        select: { id: true, username: true, isAdmin: true, isGhost: true, createdAt: true },
        orderBy: { username: "asc" },
        take: 50,
      });
    },
  );

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
