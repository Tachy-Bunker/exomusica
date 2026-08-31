import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword, requireAdmin } from "../lib/auth.js";

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
    return reply.code(201).send({ id: joinRequest.id, status: joinRequest.status });
  });

  app.get("/api/admin/join-requests", { preHandler: requireAdmin }, async () => {
    return prisma.joinRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/join-requests/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = Number(req.params.id);
      const joinRequest = await prisma.joinRequest.findUnique({ where: { id } });
      if (!joinRequest || joinRequest.status !== "PENDING") {
        return reply.code(404).send({ error: "no pending join request with that id" });
      }

      const user = await prisma.$transaction(async (tx) => {
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
        await tx.joinRequest.update({
          where: { id },
          data: { status: "APPROVED", reviewedById: req.user!.id },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: "join.approve",
            targetType: "User",
            targetId: created.id,
          },
        });
        return created;
      });

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
