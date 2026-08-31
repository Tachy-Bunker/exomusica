import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, hashPassword, verifyPassword } from "../lib/auth.js";
import { ghostifyUser } from "../services/accountService.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Self view — includes email and notification prefs, unlike the public
  // /api/users/:username lookup which deliberately hides email.
  app.get("/api/account/me", { preHandler: requireAuth }, async (req, reply) => {
    const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!me) return reply.code(404).send({ error: "no such user" });
    return {
      id: me.id,
      username: me.username,
      email: me.email,
      bio: me.bio,
      links: me.links,
      notifyWeeklySummary: me.notifyWeeklySummary,
      notifyFollowedReplies: me.notifyFollowedReplies,
      notifyPrivateMessage: me.notifyPrivateMessage,
    };
  });

  app.patch<{
    Body: Partial<{ notifyWeeklySummary: boolean; notifyFollowedReplies: boolean; notifyPrivateMessage: boolean }>;
  }>("/api/account/notifications", { preHandler: requireAuth }, async (req) => {
    return prisma.user.update({ where: { id: req.user!.id }, data: req.body ?? {} });
  });

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
      return { status: "updated" };
    },
  );

  // Public profile — everything except email (spec: accounts can see each
  // other's info except email).
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
