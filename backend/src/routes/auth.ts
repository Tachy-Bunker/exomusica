import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { signToken, verifyPassword } from "../lib/auth.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { username: string; password: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        return reply.code(400).send({ error: "username and password are required" });
      }

      const user = await prisma.user.findUnique({ where: { username } });
      // No account, or a ghost with no password (imported or deleted) -> reject
      // either way. Same error either way so login can't be used to probe
      // which usernames exist.
      if (!user || !user.passwordHash) {
        return reply.code(401).send({ error: "invalid username or password" });
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        return reply.code(401).send({ error: "invalid username or password" });
      }

      const token = signToken({ id: user.id, username: user.username, isAdmin: user.isAdmin });
      return { token, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } };
    },
  );
}
