import { randomInt } from "node:crypto";

// Paid resources: who may have the file. Pure rules, tested without a database.

/** Codes are typed by hand, so case and spaces never matter. */
export const normalizeCode = (s: unknown): string => (typeof s === "string" ? s.trim().toUpperCase().replace(/\s+/g, "") : "");
export const isValidCode = (c: string): boolean => /^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(c);

// No 0/O, 1/I/L: a code read out loud or copied from a message is not mistyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateCode(pick: (max: number) => number = (m) => randomInt(m)): string {
  const part = () => Array.from({ length: 5 }, () => ALPHABET[pick(ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

export interface CouponLike { active: boolean; itemId: number | null; maxUses: number | null; uses: number; expiresAt: Date | null }

/** null = the code works for this resource; otherwise what to tell the person. */
export function couponProblem(c: CouponLike, itemId: number, now: Date = new Date()): string | null {
  if (!c.active) return "That code has been switched off.";
  if (c.itemId !== null && c.itemId !== itemId) return "That code is for a different resource.";
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return "That code has expired.";
  if (c.maxUses !== null && c.uses >= c.maxUses) return "That code has been used up.";
  return null;
}

/** The file is handed out when the resource is free, or the viewer owns it, is an admin, or has unlocked it. */
export function canHaveFile(item: { paid: boolean; ownerId: number }, viewer: { id: number; isAdmin: boolean } | null, unlocked: boolean): boolean {
  if (!item.paid) return true;
  if (viewer && (viewer.isAdmin || viewer.id === item.ownerId)) return true;
  return unlocked;
}

/** Guessing codes is slowed down: at most `limit` tries per key in `windowMs`. */
export function makeLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const tries = new Map<string, number[]>();
  return {
    /** true = allowed (and counted); false = too many tries. */
    hit(key: string): boolean {
      const t = now();
      const recent = (tries.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) { tries.set(key, recent); return false; }
      recent.push(t);
      tries.set(key, recent);
      if (tries.size > 5000) for (const [k, v] of tries) if (!v.some((x) => t - x < windowMs)) tries.delete(k);
      return true;
    },
  };
}

/** Pictures named in a text, in order (`![alt](url)` with an optional {…} attribute list), without repeats. */
export function imagesInMarkdown(md: string, max = 24): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)) {
    const url = m[1];
    if (/^(\/uploads\/|https?:\/\/)/i.test(url) && !out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}
