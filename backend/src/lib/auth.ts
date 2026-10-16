import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "./prisma.js";

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

/** The session cookie carries the same token as the Bearer header. It is httpOnly, so page scripts cannot read it. */
export const SESSION_COOKIE = "exo_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const ALG = "HS256" as const;
const isProd = (): boolean => process.env.NODE_ENV === "production";

let cachedSecret: string | null = null;
/** The signing secret. Refuses a missing, short or placeholder value: anyone who knows a default could mint an admin token. */
export function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  const s = process.env.JWT_SECRET ?? "";
  if (s.length < 32 || s.toLowerCase().includes("changeme")) {
    throw new Error("JWT_SECRET must be a random string of at least 32 characters (openssl rand -hex 32)");
  }
  cachedSecret = s;
  return s;
}

// ---------------------------------------------------------------- account snapshot
// Verifying a token must stay synchronous (about fifteen routes call it inline), so the account state it needs
// lives in memory: who is live, whether they are still an admin, and their token version. It is re-read at boot,
// every 30 seconds, and for one account straight after a login, logout or password change. A demotion, ban or
// deletion therefore takes effect within 30 seconds.
interface Live {
  username: string;
  isAdmin: boolean;
  tokenVersion: number;
}
const ACCOUNT_SELECT = { id: true, username: true, isAdmin: true, tokenVersion: true } as const;
let live = new Map<number, Live>();

/** Re-reads one account. Ghosts and deleted accounts drop out of the snapshot, so their tokens stop working. */
export async function refreshAccount(id: number): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id }, select: { ...ACCOUNT_SELECT, isGhost: true, deletedAt: true } });
  if (!u || u.isGhost || u.deletedAt) live.delete(id);
  else live.set(id, { username: u.username, isAdmin: u.isAdmin, tokenVersion: u.tokenVersion });
}

/** Re-reads every live account. One query, a few hundred bytes per account. */
export async function refreshAllAccounts(): Promise<void> {
  const rows = await prisma.user.findMany({ where: { isGhost: false, deletedAt: null }, select: ACCOUNT_SELECT });
  const next = new Map<number, Live>();
  for (const u of rows) next.set(u.id, { username: u.username, isAdmin: u.isAdmin, tokenVersion: u.tokenVersion });
  live = next;
}

export function signToken(user: AuthedUser): string {
  const st = live.get(user.id);
  return jwt.sign({ id: user.id, tv: st?.tokenVersion ?? 0 }, sessionSecret(), { algorithm: ALG, expiresIn: SESSION_SECONDS });
}

/** Verifies a raw token string. Returns the live account it belongs to, or null if the token is bad, expired, revoked or the account is gone. */
export function verifyToken(token: string | null | undefined): AuthedUser | null {
  if (!token) return null;
  let claims: { id?: unknown; tv?: unknown };
  try {
    claims = jwt.verify(token, sessionSecret(), { algorithms: [ALG] }) as { id?: unknown; tv?: unknown };
  } catch {
    return null;
  }
  const id = claims.id;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  const st = live.get(id);
  if (!st) return null;
  const tv = typeof claims.tv === "number" ? claims.tv : 0;
  if (tv !== st.tokenVersion) return null; // signed out everywhere, or the password changed
  return { id, username: st.username, isAdmin: st.isAdmin };
}

/** The Bearer token of a request, if it has one. */
export function bearerOf(req: { headers: { authorization?: string } }): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

/** The viewer of a WebSocket. The browser sends the session cookie on the handshake, and the server turns it into the
 *  Bearer header in a hook (see server.ts). The older `?token=` query is still read for one release, so tabs opened
 *  before this change keep working. It is never written to the logs. */
export function wsUser(req: { headers: { authorization?: string }; query?: unknown }): AuthedUser | null {
  const q = (req.query as { token?: unknown } | undefined)?.token;
  return verifyToken(bearerOf(req) ?? (typeof q === "string" ? q : undefined));
}

/** Attach req.user from a Bearer token, or reply 401. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearerOf(req);
  if (!token) {
    reply.code(401).send({ error: "missing bearer token" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    reply.code(401).send({ error: "invalid or expired token" });
    return;
  }
  req.user = user;
}

/** requireAuth, then also require isAdmin. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (!req.user?.isAdmin) {
    reply.code(403).send({ error: "admin only" });
  }
}

// ---------------------------------------------------------------- session cookie
export function readCookie(req: { headers: { cookie?: string } }, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${isProd() ? "; Secure" : ""}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd() ? "; Secure" : ""}`;
}

export const hashPassword = argon2.hash;
export const verifyPassword = argon2.verify;
