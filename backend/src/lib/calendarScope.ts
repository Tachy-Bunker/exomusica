// Who may enter a calendar: a signed token per calendar, valid 30 days and until the password changes (fix412).
// Its key is derived from the same secret as Outreach's but with its own label, so a calendar token is never an Outreach token.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./auth.js";
import { makeLimiter } from "./outreachScope.js";

const key = (): Buffer => createHash("sha256").update((process.env.CALENDAR_SECRET || sessionSecret()) + "|calendars").digest();
const b64 = (s: string): string => Buffer.from(s).toString("base64url");
const sign = (body: string): string => createHmac("sha256", key()).update(body).digest("base64url");

export function signCalendarToken(calendarId: number, version: number, days = 30): string {
  const body = b64(JSON.stringify({ c: calendarId, v: version, e: Date.now() + days * 86_400_000 }));
  return `${body}.${sign(body)}`;
}
export function readCalendarToken(token: string | undefined): { c: number; v: number } | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c: unknown; v: unknown; e: unknown };
    if (typeof p.e !== "number" || p.e <= Date.now() || !Number.isInteger(p.c) || !Number.isInteger(p.v)) return null;
    return { c: p.c as number, v: p.v as number };
  } catch { return null; }
}

/** Tries per address and calendar, and per address overall: slows down guessing without locking real people out for long. */
export const enterPerSlug = makeLimiter(8, 10 * 60_000), enterPerIp = makeLimiter(40, 60 * 60_000);
/** Link previews fetch other sites: a few per minute per address and calendar. */
export const previewPerKey = makeLimiter(20, 10 * 60_000), previewPerIp = makeLimiter(60, 60 * 60_000);
/** Writes (add, change, remove) per address and calendar: a busy guest is slowed down, a normal one never notices. */
export const writePerKey = makeLimiter(120, 10 * 60_000);
