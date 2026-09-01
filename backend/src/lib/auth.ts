import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { FastifyRequest, FastifyReply } from "fastify";

export interface AuthedUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme";

export function signToken(user: AuthedUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

/** Verifies a raw token string, returning the decoded user or null. Used
 *  by the presence WebSocket route, which gets its token via query string
 *  since browsers can't attach custom headers to a WS handshake. */
export function verifyToken(token: string): AuthedUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthedUser;
  } catch {
    return null;
  }
}

/** Attach req.user from a Bearer token, or reply 401. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing bearer token" });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthedUser;
  } catch {
    reply.code(401).send({ error: "invalid or expired token" });
  }
}

/** requireAuth, then also require isAdmin. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (!req.user?.isAdmin) {
    reply.code(403).send({ error: "admin only" });
  }
}

export const hashPassword = argon2.hash;
export const verifyPassword = argon2.verify;
