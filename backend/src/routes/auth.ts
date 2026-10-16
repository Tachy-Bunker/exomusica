import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { bearerOf, clearedSessionCookie, refreshAccount, requireAuth, sessionCookie, signToken, verifyPassword, verifyToken } from "../lib/auth.js";
import { makeLimiter } from "../lib/resourceAccess.js";

// Sign-in guesses: 8 per address and username, and 60 per address, in any 15 minutes. A wrong guess and a right one
// count the same, so a guess list cannot be tried faster than this.
const perAccount = makeLimiter(8, 15 * 60_000);
const perAddress = makeLimiter(60, 15 * 60_000);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { username: string; password: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        return reply.code(400).send({ error: "username and password are required" });
      }
      if (!perAddress.hit(req.ip) || !perAccount.hit(`${req.ip}|${String(username).toLowerCase()}`)) {
        return reply.code(429).send({ error: "Too many sign-in attempts. Try again in a few minutes." });
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

      await refreshAccount(user.id);
      // The session lives in an httpOnly cookie, so page scripts never see the token.
      reply.header("Set-Cookie", sessionCookie(signToken({ id: user.id, username: user.username, isAdmin: user.isAdmin })));
      return { user: { id: user.id, username: user.username, isAdmin: user.isAdmin } };
    },
  );

  /** Signs out. Every session of this account ends, on every device: the account's token version goes up. */
  app.post("/api/auth/logout", async (req, reply) => {
    const user = verifyToken(bearerOf(req));
    if (user) {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
        await refreshAccount(user.id);
      } catch (err) {
        req.log.error({ err: (err as Error).message }, "logout: could not revoke the session");
      }
    }
    reply.header("Set-Cookie", clearedSessionCookie());
    return { status: "signed out" };
  });

  /** Who the session belongs to. The page asks this on load instead of trusting what it kept in the browser. */
  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => ({ user: req.user }));

  /** Turns a login token kept by an older version of the page into the session cookie. */
  app.post("/api/auth/session", { preHandler: requireAuth }, async (req, reply) => {
    reply.header("Set-Cookie", sessionCookie(bearerOf(req)!));
    return { user: req.user };
  });
}
