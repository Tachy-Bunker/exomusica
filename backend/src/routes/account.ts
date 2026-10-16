import { adminEdit, memberNotifications, memberProfile, memberVisualEffects } from "../lib/profileInput.js";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, hashPassword, verifyPassword, refreshAccount, sessionCookie, signToken } from "../lib/auth.js";
import { ghostifyUser } from "../services/accountService.js";
import { createNotification } from "../lib/notify.js";
import { saveSiteImage } from "../lib/storage.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Self view - includes email and notification prefs, unlike the public
  // /api/users/:username lookup which deliberately hides email.
  app.get("/api/account/followed-channels", { preHandler: requireAuth }, async (req) => {
    const follows = await prisma.channelFollow.findMany({
      where: { userId: req.user!.id },
      include: { channel: { select: { slug: true } } },
    });
    return follows.map((f) => f.channel.slug);
  });

  // Deliberately tighter than the site's general 10MB body limit - an
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
      include: {
        followedChannels: { include: { channel: { select: { slug: true, name: true } } } },
        collaboratorProfile: { select: { slug: true } },
      },
    });
    if (!me) return reply.code(404).send({ error: "no such user" });
    return {
      id: me.id,
      username: me.username,
      email: me.email,
      bio: me.bio,
      links: me.links,
      collaboratorSlug: me.collaboratorProfile?.slug ?? null,
      volumeNotifications: me.volumeNotifications,
      volumeSfxIdle: me.volumeSfxIdle,
      volumeSfxPlaying: me.volumeSfxPlaying,
      volumeMusic: me.volumeMusic,
      caEnabled: me.caEnabled,
      exclusiveMediaPlayback: me.exclusiveMediaPlayback,
      moireEnabled: me.moireEnabled,
      notifyWeeklySummary: me.notifyWeeklySummary,
      notifyDailySummary: me.notifyDailySummary,
      notifyFollowedReplies: me.notifyFollowedReplies,
      notifyPrivateMessage: me.notifyPrivateMessage,
      discordUsername: me.discordUsername,
      discordUserId: me.discordUserId,
      notifyDiscordWeeklySummary: me.notifyDiscordWeeklySummary,
      notifyDiscordDailySummary: me.notifyDiscordDailySummary,
      notifyDiscordFollowedReplies: me.notifyDiscordFollowedReplies,
      notifyDiscordPrivateMessage: me.notifyDiscordPrivateMessage,
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
      discordUsername: string | null;
      discordUserId: string | null;
      notifyDiscordWeeklySummary: boolean;
      notifyDiscordDailySummary: boolean;
      notifyDiscordFollowedReplies: boolean;
      notifyDiscordPrivateMessage: boolean;
    }>;
  }>("/api/account/notifications", { preHandler: requireAuth }, async (req, reply) => {
    const { data, bad } = memberNotifications(req.body);
    if (bad.length) return reply.code(400).send({ error: `Invalid: ${bad.join(", ")}` });
    return prisma.user.update({ where: { id: req.user!.id }, data, select: { id: true } });
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

  app.patch<{ Body: Partial<{ caEnabled: boolean; moireEnabled: boolean; exclusiveMediaPlayback: boolean }> }>(
    "/api/account/visual-effects",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { data, bad } = memberVisualEffects(req.body);
      if (bad.length) return reply.code(400).send({ error: `Invalid: ${bad.join(", ")}` });
      return prisma.user.update({ where: { id: req.user!.id }, data, select: { id: true } });
    },
  );

  app.patch<{ Body: Partial<{ bio: string; links: { label: string; url: string }[] }> }>(
    "/api/account/profile",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { data, bad } = memberProfile(req.body);
      if (bad.length) return reply.code(400).send({ error: bad.includes("links") ? "Links must be http(s) addresses (up to 10)" : `Invalid: ${bad.join(", ")}` });
      return prisma.user.update({ where: { id: req.user!.id }, data, select: { id: true } });
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
      // Changing the password signs out every other session (the token version goes up); this one gets a fresh cookie.
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
      });
      await refreshAccount(req.user!.id);
      reply.header("Set-Cookie", sessionCookie(signToken(req.user!)));
      void createNotification(req.user!.id, "account_updated", "Password changed", "Your password was updated.").catch((err) =>
        app.log.error(err, "createNotification failed"),
      );
      return { status: "updated" };
    },
  );

  // Public profile - everything except email (spec: accounts can see each
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
        upgradeChoice: true,
        storageLimitBytes: true,
        storageUsedBytes: true,
      },
    });
    if (!user) return reply.code(404).send({ error: "no such user" });
    const { upgradeChoice, storageLimitBytes, storageUsedBytes, ...rest } = user;
    const choice = upgradeChoice as { frame?: string | null; tint?: string | null } | null;
    const frame = choice?.frame ?? null; // validated against what they've earned when they chose it
    return { ...rest, frame, tint: choice?.tint ?? null, storageLimitMb: Math.round(Number(storageLimitBytes) / 1048576), storageUsedMb: Math.round(Number(storageUsedBytes) / 1048576) };
  });

  // What an admin may change on someone's profile (moderation, or filling in a picture they never added).
  // Whitelisted and validated: see lib/profileInput.ts. Every change is written to the audit log (never the password itself).
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, isGhost: true, upgradeChoice: true } });
    if (!target) return reply.code(404).send({ error: "no such user" });
    const edit = adminEdit(req.body, { isGhost: target.isGhost, self: id === req.user!.id });
    if (edit.error) return reply.code(400).send({ error: edit.error });
    if (edit.bad.length) {
      const why: Record<string, string> = { username: "Username: 3-32 characters, letters, numbers, _ - . only", email: "That isn't a valid email address", password: "Password: 8 to 200 characters", storageLimitMb: "Storage limit: a whole number of MB, 0 to 100000", avatarUrl: "Picture: upload one, or paste an address that starts with /uploads/", links: "Links must be http(s) addresses (up to 10)", bio: "Bio is too long (1000 characters at most)", isAdmin: "Admin must be on or off" };
      return reply.code(400).send({ error: why[edit.bad[0]!] ?? `Invalid: ${edit.bad.join(", ")}` });
    }
    const data: Record<string, unknown> = { ...edit.data };
    if (typeof data.username === "string") {
      const clash = await prisma.user.findFirst({ where: { id: { not: id }, username: { equals: data.username, mode: "insensitive" } }, select: { id: true } });
      if (clash) return reply.code(409).send({ error: "That username is taken" });
    }
    if (typeof data.email === "string") {
      const clash = await prisma.user.findFirst({ where: { id: { not: id }, email: { equals: data.email, mode: "insensitive" } }, select: { id: true } });
      if (clash) return reply.code(409).send({ error: "Another account already uses that email" });
    }
    if (edit.password) {
      data.passwordHash = await hashPassword(edit.password);
      data.tokenVersion = { increment: 1 }; // the account's other sessions end with the old password
    }
    if (edit.clear.frame || edit.clear.tint) {
      const cur = (target.upgradeChoice ?? { frame: null, tint: null }) as { frame: string | null; tint: string | null };
      data.upgradeChoice = { frame: edit.clear.frame ? null : cur.frame, tint: edit.clear.tint ? null : cur.tint };
    }
    if (Object.keys(data).length === 0) return { id };
    try {
      await prisma.user.update({ where: { id }, data });
    } catch {
      return reply.code(409).send({ error: "Save failed: that username or email may already be taken" });
    }
    // Role, name, ban and password changes take effect now, not at the next 30-second snapshot refresh.
    await refreshAccount(id);
    if (edit.password && id === req.user!.id) reply.header("Set-Cookie", sessionCookie(signToken(req.user!)));
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "user.edit", targetType: "User", targetId: id, meta: { fields: [...Object.keys(edit.data).map((k) => (k === "storageLimitBytes" ? "storageLimit" : k)), ...(edit.password ? ["password"] : []), ...(edit.clear.frame ? ["clearFrame"] : []), ...(edit.clear.tint ? ["clearTint"] : [])] } },
    }).catch(() => undefined);
    return { id };
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

  app.get<{ Querystring: { q?: string; ghostsOnly?: string; page?: string } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req) => {
      const { q, ghostsOnly } = req.query;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = 50;
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
          storageUsedBytes: true,
          storageLimitBytes: true,
          _count: { select: { messages: true } },
        },
        orderBy: { username: "asc" },
      });
      // Active, then linked ghosts, then unlinked ghosts - alphabetical
      // within each group. Whether a ghost is linked isn't a plain scalar
      // column Prisma can sort on directly, so rank it here instead.
      const rank = (u: (typeof users)[number]) => (!u.isGhost ? 0 : u.linkedUserId ? 1 : 2);
      users.sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));
      const total = users.length;
      const pageUsers = (ghostsOnly === "true" ? users : users.slice((page - 1) * pageSize, page * pageSize)).map((u) => ({
        ...u,
        storageUsedBytes: Number(u.storageUsedBytes),
        storageLimitBytes: Number(u.storageLimitBytes),
      }));
      return { users: pageUsers, total, page, pageSize };
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

      // Deliberately NOT reassigning message.authorId - this is a
      // persistent link, resolved at read time (message display, export,
      // mentions) rather than a one-time backfill. That's what makes it
      // safe to relink/unlink later, and what makes a future Discord bot
      // bridge work: new messages can keep arriving tagged with this
      // discordId's ghost, and every reader resolves through the link to
      // the real account automatically - no per-message reassignment
      // needed going forward.
      await prisma.user.update({ where: { id: ghostId }, data: { linkedUserId: targetUserId } });
      if (ghost.discordId && !target.discordUserId) {
        await prisma.user.update({ where: { id: targetUserId }, data: { discordUserId: ghost.discordId } });
      }
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
  // account's current username - without ever rewriting the message.
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

  app.get<{ Querystring: { q?: string } }>("/api/users/mention-search", { preHandler: requireAuth }, async (req) => {
    const q = (req.query.q ?? "").trim();
    if (q.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { username: { startsWith: q, mode: "insensitive" } },
      select: { username: true, avatarUrl: true, isGhost: true },
      take: 8,
      orderBy: { username: "asc" },
    });
    return users;
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
