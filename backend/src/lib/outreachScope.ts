import { createHmac, timingSafeEqual } from "node:crypto";

// ---- who may enter: a signed token per workspace, valid until the password changes
const secret = (): string => process.env.OUTREACH_SECRET ?? process.env.JWT_SECRET ?? "changeme";
const b64 = (s: string): string => Buffer.from(s).toString("base64url");
const sign = (body: string): string => createHmac("sha256", secret()).update(body).digest("base64url");

export function signWorkspaceToken(workspaceId: number, version: number, days = 30): string {
  const body = b64(JSON.stringify({ w: workspaceId, v: version, e: Date.now() + days * 86400_000 }));
  return `${body}.${sign(body)}`;
}
export function readWorkspaceToken(token: string | undefined): { w: number; v: number } | null {
  if (!token) return null; const [body, mac] = token.split("."); if (!body || !mac) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(mac); if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { w: number; v: number; e: number }; return p.e > Date.now() && Number.isInteger(p.w) ? { w: p.w, v: p.v } : null; } catch { return null; }
}

/** Tries per address and workspace: slows down guessing without locking real people out for long. */
export function makeLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    blocked(key: string): number { const t = now(); const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs); hits.set(key, list); return list.length >= max ? Math.ceil((windowMs - (t - list[0])) / 1000) : 0; },
    fail(key: string): void { const list = hits.get(key) ?? []; list.push(now()); hits.set(key, list); if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => now() - x < windowMs)) hits.delete(k); },
    clear(key: string): void { hits.delete(key); },
  };
}

export const slugify = (s: string): string => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
