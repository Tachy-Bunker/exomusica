// Calendar rules (fix412). Pure: no database, no network. Every check says what is wrong in a sentence the editor can show.
import { randomBytes } from "node:crypto";

export const EVENT_LIMITS = { title: 120, text: 2000, url: 500, location: 160, addedBy: 40 } as const;
export const PASSWORD_MIN = 4, PASSWORD_MAX = 120;
export const IMAGE_MAX_BYTES = 1_000_000;
export const MAX_EVENTS = 3000;
/** Pictures kept per calendar by default; the admin sets each calendar's own cap (1 to MAX_PICTURE_CAP). */
export const DEFAULT_PICTURE_CAP = 200, MAX_PICTURE_CAP = 2000;
export const MAX_MEMBERS = 50;
/** "guests": anyone who can open a calendar may change its events. "members": only its creator, the admin and its members. */
export const EDIT_MODES = ["guests", "members"] as const;
export type EditMode = (typeof EDIT_MODES)[number];
const RESERVED = new Set(["new", "api", "admin", "calendar", "calendars", "enter", "login", "static"]);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const clean = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** An address for a calendar: lower case letters, digits and dashes, 2 to 40 characters. */
export function checkSlug(raw: unknown): Checked<string> {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(s) || /--/.test(s) || s.endsWith("-")) return { ok: false, error: "An address is 2 to 40 letters, digits or dashes, and does not start or end with a dash." };
  if (RESERVED.has(s)) return { ok: false, error: `“${s}” is reserved. Pick another address.` };
  return { ok: true, value: s };
}

export function checkPassword(raw: unknown): Checked<string> {
  const p = String(raw ?? "");
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return { ok: false, error: `The password is ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` };
  return { ok: true, value: p };
}

export function checkTimezone(raw: unknown): Checked<string> {
  const tz = String(raw ?? "").trim();
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return { ok: true, value: tz }; }
  catch { return { ok: false, error: "That time zone is not known. Use a name such as Europe/Paris." }; }
}

export function checkName(raw: unknown): Checked<string> {
  const n = clean(raw, 80);
  return n ? { ok: true, value: n } : { ok: false, error: "A calendar needs a name." };
}

/** A link in an event: http or https only, with a host. Stored as the normalised address. */
export function checkUrl(raw: unknown): Checked<string | null> {
  const s = clean(raw, EVENT_LIMITS.url);
  if (!s) return { ok: true, value: null };
  try {
    const u = new URL(s);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname || u.username || u.password) throw new Error("bad");
    return { ok: true, value: u.toString().slice(0, EVENT_LIMITS.url) };
  } catch { return { ok: false, error: "The link must start with https:// (or http://)." }; }
}

export const RECURRENCES = ["daily", "weekly", "monthly", "yearly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];
/** How many days one repeat may skip. A calendar with more skipped days than this is one to tidy up by hand. */
export const MAX_SKIPS = 1000;

export interface EventInput {
  title: string; text: string; url: string | null; location: string; startsAt: Date; endsAt: Date | null; allDay: boolean; imageId: number | null; addedBy: string;
  lat: number | null; lng: number | null; recurrence: Recurrence | null; recurUntil: string | null;
}

/** One event from a request body. Times are ISO strings; the end is not before the start. */
export function checkEvent(body: unknown): Checked<EventInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "No event sent." };
  const b = body as Record<string, unknown>;
  const title = clean(b.title, EVENT_LIMITS.title);
  if (!title) return { ok: false, error: "An event needs a title." };
  const url = checkUrl(b.url);
  if (!url.ok) return url;
  const startsAt = parseWhen(b.startsAt);
  if (!startsAt) return { ok: false, error: "The start is missing or is not a date and time." };
  const endsAt = b.endsAt == null || b.endsAt === "" ? null : parseWhen(b.endsAt);
  if (b.endsAt != null && b.endsAt !== "" && !endsAt) return { ok: false, error: "The end is not a date and time." };
  if (endsAt && endsAt < startsAt) return { ok: false, error: "The end is before the start." };
  const imageRaw = b.imageId;
  const imageId = imageRaw == null || imageRaw === "" ? null : Number(imageRaw);
  if (imageId !== null && (!Number.isInteger(imageId) || imageId < 1)) return { ok: false, error: "The picture is not valid." };
  const coords = checkCoords(b.lat, b.lng);
  if (!coords.ok) return { ok: false, error: coords.error };
  const rec = checkRecurrence(b.recurrence);
  if (!rec.ok) return { ok: false, error: rec.error };
  let recurUntil: string | null = null;
  if (rec.value !== null && b.recurUntil != null && b.recurUntil !== "") {
    const d = checkDay(b.recurUntil);
    if (!d.ok) return { ok: false, error: "The last day of a repeat is written YYYY-MM-DD." };
    recurUntil = d.value;
  }
  return { ok: true, value: {
    title, text: clean(b.text, EVENT_LIMITS.text), url: url.value, location: clean(b.location, EVENT_LIMITS.location),
    startsAt, endsAt, allDay: b.allDay === true, imageId, addedBy: clean(b.addedBy, EVENT_LIMITS.addedBy),
    lat: coords.value?.lat ?? null, lng: coords.value?.lng ?? null, recurrence: rec.value, recurUntil,
  } };
}

/** "daily", "weekly", "monthly", "yearly", or none (null). */
export function checkRecurrence(raw: unknown): Checked<Recurrence | null> {
  if (raw == null || raw === "") return { ok: true, value: null };
  return (RECURRENCES as readonly string[]).includes(String(raw)) ? { ok: true, value: raw as Recurrence } : { ok: false, error: "A repeat is daily, weekly, monthly or yearly, or none." };
}

/** A day "YYYY-MM-DD" that is a real date. */
export function checkDay(raw: unknown): Checked<string> {
  const s = String(raw ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { ok: false, error: "A day is written YYYY-MM-DD." };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const real = d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  return real ? { ok: true, value: s } : { ok: false, error: "A day is written YYYY-MM-DD." };
}

/** Both coordinates, or neither (null). A latitude is -90 to 90, a longitude -180 to 180. */
export function checkCoords(lat: unknown, lng: unknown): Checked<{ lat: number; lng: number } | null> {
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(lat) && empty(lng)) return { ok: true, value: null };
  if (empty(lat) || empty(lng)) return { ok: false, error: "The coordinates need both a latitude and a longitude." };
  const a = Number(lat), o = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(o) || a < -90 || a > 90 || o < -180 || o > 180) return { ok: false, error: "The coordinates are a latitude (-90 to 90) and a longitude (-180 to 180)." };
  return { ok: true, value: { lat: a, lng: o } };
}

/** The calendar day ("YYYY-MM-DD") of an instant, in the calendar's zone. */
export function dayKeyIn(when: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

/** Who may change events: one of EDIT_MODES. */
export function checkEditMode(raw: unknown): Checked<EditMode> {
  const v = String(raw ?? "");
  return (EDIT_MODES as readonly string[]).includes(v) ? { ok: true, value: v as EditMode } : { ok: false, error: "Who may change events is “guests” or “members”." };
}

/** The picture cap: a whole number from 1 to MAX_PICTURE_CAP. */
export function checkCap(raw: unknown): Checked<number> {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_PICTURE_CAP ? { ok: true, value: n } : { ok: false, error: `The picture cap is a whole number from 1 to ${MAX_PICTURE_CAP}.` };
}

/** Usernames of the members: a list, or text with names separated by commas, semicolons or spaces. No duplicates (in any case). */
export function checkMembers(raw: unknown): Checked<string[]> {
  const list: unknown[] | null = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\s]+/) : raw == null ? [] : null;
  if (!list) return { ok: false, error: "The members are a list of usernames." };
  const names: string[] = [];
  for (const x of list) {
    const n = String(x ?? "").trim();
    if (!n) continue;
    if (n.length > 40) return { ok: false, error: "A username is at most 40 characters." };
    if (!names.some((m) => m.toLowerCase() === n.toLowerCase())) names.push(n);
  }
  if (names.length > MAX_MEMBERS) return { ok: false, error: `A calendar has at most ${MAX_MEMBERS} members.` };
  return { ok: true, value: names };
}

/** An ISO date and time, or null. Accepts only a real instant: no 0000 years, no invalid dates. */
export function parseWhen(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 1971 && d.getUTCFullYear() <= 2200 ? d : null;
}

/** The picture type from its first bytes: PNG, JPEG or WebP. Null for anything else. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** A random key for a picture: only someone who has read an event knows it. */
export const newImageKey = (): string => randomBytes(12).toString("base64url");

/** The time window of a listing: `from` and `to` as ISO strings, either optional. Null when neither is given. */
export function checkWindow(from: unknown, to: unknown): Checked<{ from: Date | null; to: Date | null }> {
  const f = from == null || from === "" ? null : parseWhen(from);
  const t = to == null || to === "" ? null : parseWhen(to);
  if ((from != null && from !== "" && !f) || (to != null && to !== "" && !t)) return { ok: false, error: "The dates must be ISO date and time, such as 2026-11-12T19:00:00Z." };
  if (f && t && t < f) return { ok: false, error: "The end of the window is before its start." };
  return { ok: true, value: { from: f, to: t } };
}
