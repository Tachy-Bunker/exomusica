import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword, requireAdmin } from "../lib/auth.js";
import { sendTemplatedMail } from "../lib/emailTemplates.js";
import { sendMail } from "../lib/mailer.js";
import { sendDiscordDM, sendDiscordAnnouncement } from "../lib/discordBot.js";
import { createNotification } from "../lib/notify.js";

interface JoinBody {
  username: string;
  email: string;
  password: string;
  bio?: string;
  links?: { label: string; url: string }[];
  reason: string;
}

export async function joinRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: JoinBody }>("/api/join", async (req, reply) => {
    const { username, email, password, bio, links, reason } = req.body ?? {};
    if (!username || !email || !password || !reason) {
      return reply
        .code(400)
        .send({ error: "username, email, password, and reason are required" });
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      return reply.code(400).send({
        error: "username must be 3-32 characters: letters, numbers, underscore, hyphen, or period only — no spaces",
      });
    }
    const existing = await prisma.joinRequest.findFirst({
      where: { OR: [{ username }, { email }], status: "PENDING" },
    });
    if (existing) {
      return reply.code(409).send({ error: "a request for that username or email is already pending" });
    }
    const passwordHash = await hashPassword(password);
    const joinRequest = await prisma.joinRequest.create({
      data: { username, email, passwordHash, bio, links, reason },
    });

    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (settings?.joinNotifyEmail) {
      void sendMail(
        settings.joinNotifyEmail,
        `New join request: ${username}`,
        `${username} (${email}) wants to join Exomusica.\n\nReason: ${reason}\n\nReview it at /admin/join-requests.`,
      ).catch((err) => app.log.error(err, "join-request admin notification failed"));
    }
    if (settings?.joinNotifyDiscordUsername || settings?.joinNotifyDiscordUserId) {
      void sendDiscordDM(
        { discordUserId: settings.joinNotifyDiscordUserId, discordUsername: settings.joinNotifyDiscordUsername },
        `New join request: ${username} (${email}) wants to join Exomusica.\nReason: ${reason}\nReview it at /admin/join-requests.`,
      );
    }
    void sendDiscordAnnouncement("join_applied", `${username} applied to join Exomusica!`);

    return reply.code(201).send({ id: joinRequest.id, status: joinRequest.status });
  });

  app.get("/api/admin/join-requests", { preHandler: requireAdmin }, async () => {
    return prisma.joinRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post<{ Params: { id: string }; Body: { confirmClaimGhost?: boolean } }>(
    "/api/admin/join-requests/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = Number(req.params.id);
      const joinRequest = await prisma.joinRequest.findUnique({ where: { id } });
      if (!joinRequest || joinRequest.status !== "PENDING") {
        return reply.code(404).send({ error: "no pending join request with that id" });
      }

      const existingGhost = await prisma.user.findFirst({
        where: { username: { equals: joinRequest.username, mode: "insensitive" }, isGhost: true },
      });
      const existingRealUser = await prisma.user.findFirst({
        where: { username: { equals: joinRequest.username, mode: "insensitive" }, isGhost: false },
      });
      if (existingRealUser) {
        return reply.code(409).send({
          error: `A real account already exists with the username "${existingRealUser.username}" — this join request can't be approved as-is. Rename or reject it.`,
        });
      }

      // A username match with a ghost does NOT mean it's the same person —
      // ghost usernames come from Discord display names, which anyone could
      // coincidentally pick when signing up for real. Never link silently;
      // require the admin to explicitly confirm after seeing who the ghost
      // actually is (its Discord identity), sent back on the first attempt.
      if (existingGhost && !req.body?.confirmClaimGhost) {
        return reply.code(409).send({
          error: `A ghost account already exists with this exact username, imported from Discord (Discord identity: ${existingGhost.discordUsername ?? existingGhost.discordId ?? "unknown"}, created ${existingGhost.createdAt.toISOString().slice(0, 10)}). A matching username does NOT guarantee it's the same person. If you're confident it is, confirm to link the ghost's imported message history to this new account (same as the manual link-ghost tool in Users — the ghost keeps its own row, nothing is merged). If you're not sure, cancel and reject the request or ask them to pick a different username instead.`,
        });
      }

      const user = await prisma.$transaction(async (tx) => {
        // Same non-destructive linking used by the manual admin
        // link-ghost tool: the ghost keeps its own row and message
        // history untouched, just renamed out of the way so its
        // original username is free for the new real account. Readers
        // resolve a linked ghost's messages through to the real account
        // at display time — nothing here rewrites message.authorId.
        if (existingGhost) {
          await tx.user.update({
            where: { id: existingGhost.id },
            data: { username: `${existingGhost.username}-ghost-${existingGhost.id}` },
          });
        }
        const created = await tx.user.create({
          data: {
            username: joinRequest.username,
            email: joinRequest.email,
            passwordHash: joinRequest.passwordHash,
            avatarUrl: joinRequest.avatarUrl,
            bio: joinRequest.bio,
            links: joinRequest.links ?? undefined,
          },
        });
        if (existingGhost) {
          await tx.user.update({ where: { id: existingGhost.id }, data: { linkedUserId: created.id } });
          if (existingGhost.discordId) {
            await tx.user.update({ where: { id: created.id }, data: { discordUserId: existingGhost.discordId } });
          }
        }
        await tx.joinRequest.update({
          where: { id },
          data: { status: "APPROVED", reviewedById: req.user!.id },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: existingGhost ? "join.approve_link_ghost" : "join.approve",
            targetType: "User",
            targetId: created.id,
          },
        });
        return created;
      });

      if (user.email) {
        void sendTemplatedMail("JOIN_APPROVED", user.email, user.username).catch((err) => app.log.error(err, "sendTemplatedMail failed"));
      }
      void createNotification(user.id, "join_approved", "You're in", "Your Exomusica account was approved.").catch((err) =>
        app.log.error(err, "createNotification failed"),
      );
      void sendDiscordAnnouncement("join_approved", `${user.username} was approved for Exomusical experiments!`);
      return { id: user.id, username: user.username };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/join-requests/:id/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = Number(req.params.id);
      const joinRequest = await prisma.joinRequest.findUnique({ where: { id } });
      if (!joinRequest || joinRequest.status !== "PENDING") {
        return reply.code(404).send({ error: "no pending join request with that id" });
      }
      await prisma.joinRequest.update({
        where: { id },
        data: { status: "REJECTED", reviewedById: req.user!.id },
      });
      return { id, status: "REJECTED" };
    },
  );
}
