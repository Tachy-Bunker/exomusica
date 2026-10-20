// Collaborative calendars (fix412, Outreach's pattern; fix413: edit modes, members, the picture cap).
// An open calendar is readable by anyone with its address; a protected one by anyone with its password (the password travels in
// the link, after the `#`, and the page sends it once). Who may CHANGE events is the calendar's edit mode:
//   "guests"  - anyone who can open it (with its password, or any visitor when it is open);
//   "members" - only its creator, the admin and the site accounts listed as members (they need no password).
// Settings: the creator (or the admin) sets the edit mode and the members; only the admin sets the picture cap and deletes.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { bearerOf, verifyToken } from "../lib/auth.js";
import { slugify } from "../lib/outreachScope.js";
import { checkCap, checkDay, checkEditMode, checkEvent, checkMembers, checkName, checkPassword, checkSlug, checkTimezone, checkUrl, checkWindow, dayKeyIn, sniffImage, newImageKey, type Checked, DEFAULT_PICTURE_CAP, IMAGE_MAX_BYTES, MAX_EVENTS, MAX_SKIPS } from "../lib/calendarRules.js";
import { enterPerIp, enterPerSlug, previewPerIp, previewPerKey, readCalendarToken, signCalendarToken, writePerKey } from "../lib/calendarScope.js";
import { feedOf, keyMatches, newFeedKey, type FeedEvent } from "../lib/calendarFeed.js";
import { readBody, safeGet } from "../lib/netGuard.js";
import { parsePreview } from "../lib/linkPreview.js";
import { geocode, GeocodeBusy, GeocodeDown } from "../lib/geocode.js";
import { makeLimiter } from "../lib/resourceAccess.js";

const geocodePerIp = makeLimiter(30, 60_000); // address searches a minute from one visitor

const DUMMY = argon2.hash("not-a-real-password"); // so a wrong address takes as long as a wrong password
const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
const LOCKED = "This calendar is locked. Open its link (with its password) first.";
const NOT_EDITOR = "You can look at this calendar, but only its editors change it.";
const msgOf = (e: unknown): string => { const m = e instanceof Error ? e.message : "Could not read that page."; return m[0].toUpperCase() + m.slice(1); };

/** A public page or picture. Standard ports only; the address is checked when connected and each redirect again (netGuard);
 *  a body over the limit is refused, never cut short. */
async function fetchPage(raw: string, maxBytes: number, accept: (type: string) => boolean): Promise<{ url: string; body: Buffer }> {
  const url = new URL(raw);
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("only the standard web ports are read");
  const { res, url: finalUrl } = await safeGet(url, {
    headers: { "user-agent": "ExomusicaCalendarPreview/1.0", accept: "text/html,application/xhtml+xml,image/png,image/jpeg,image/webp;q=0.9" },
    timeoutMs: 6000, maxRedirects: 3,
  });
  const status = res.statusCode ?? 0;
  if (status < 200 || status >= 300) { res.resume(); throw new Error(`the site answered ${status}`); }
  const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (!accept(type)) { res.resume(); throw new Error("that page is not one we can read"); }
  if (Number(res.headers["content-length"] ?? 0) > maxBytes) { res.resume(); throw new Error("that file is too large"); }
  const body = await readBody(res, maxBytes + 1, 8000);
  if (body.length > maxBytes) throw new Error("that file is too large");
  return { url: finalUrl.toString(), body };
}

type Cal = { id: number; slug: string; name: string; timezone: string; passwordHash: string | null; tokenVersion: number; editMode: string; members: string[]; pictureCap: number; createdBy: string; feedKey: string | null };
const CAL = { id: true, slug: true, name: true, timezone: true, passwordHash: true, tokenVersion: true, editMode: true, members: true, pictureCap: true, createdBy: true, feedKey: true } as const;
const EVENT = { id: true, title: true, text: true, url: true, location: true, startsAt: true, endsAt: true, allDay: true, addedBy: true, lat: true, lng: true, recurrence: true, recurUntil: true, exdates: true, createdAt: true, updatedAt: true, image: { select: { id: true, key: true } } } as const;
type EventRow = Prisma.CalendarEventGetPayload<{ select: typeof EVENT }>;

export const imageUrl = (id: number, key: string): string => `/api/calendar-images/${id}/${key}`;
const toEvent = (e: EventRow) => ({
  id: e.id, title: e.title, text: e.text, url: e.url, location: e.location,
  startsAt: e.startsAt.toISOString(), endsAt: e.endsAt ? e.endsAt.toISOString() : null, allDay: e.allDay, addedBy: e.addedBy,
  lat: e.lat, lng: e.lng, recurrence: e.recurrence, recurUntil: e.recurUntil, exdates: e.exdates,
  image: e.image ? { id: e.image.id, url: imageUrl(e.image.id, e.image.key) } : null,
  createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(),
});
// The subscription feed (fix420): the fields it writes, the most events it writes, and a row as the feed's pure writer reads it.
const FEED_MAX = 2000;
const FEED_EVENT = { id: true, title: true, text: true, url: true, location: true, startsAt: true, endsAt: true, allDay: true, lat: true, lng: true, recurrence: true, recurUntil: true, exdates: true, updatedAt: true } as const;
const FEED_RECURS = ["daily", "weekly", "monthly", "yearly"] as const;
const feedRow = (e: Prisma.CalendarEventGetPayload<{ select: typeof FEED_EVENT }>): FeedEvent => ({
  id: e.id, title: e.title, text: e.text, url: e.url, location: e.location,
  startsAt: e.startsAt.toISOString(), endsAt: e.endsAt ? e.endsAt.toISOString() : null, allDay: e.allDay,
  lat: e.lat, lng: e.lng,
  recurrence: (FEED_RECURS as readonly string[]).includes(e.recurrence ?? "") ? (e.recurrence as FeedEvent["recurrence"]) : null,
  recurUntil: e.recurUntil, exdates: e.exdates, updatedAt: e.updatedAt.toISOString(),
});
const calOut = (c: Cal) => ({ slug: c.slug, name: c.name, timezone: c.timezone, protected: !!c.passwordHash, editMode: c.editMode, members: c.members, pictureCap: c.pictureCap });
/** What a calendar says about this caller: whether it is locked to them, whether they may change events, whether they may change its settings. */
const viewOf = (req: FastifyRequest, c: Cal) => ({ ...calOut(c), locked: !allowed(req, c), canEdit: editsCal(req, c), canManage: managesCal(req, c) });

const userOf = (req: FastifyRequest) => verifyToken(bearerOf(req));
const isAdminReq = (req: FastifyRequest): boolean => userOf(req)?.isAdmin === true;
/** The creator (signed in as the username that made it) or a site member listed on it. */
const memberOf = (req: FastifyRequest, c: Cal): boolean => { const u = userOf(req); return !!u && (u.username === c.createdBy || c.members.includes(u.username)); };
/** Settings: the admin, and the creator. */
const managesCal = (req: FastifyRequest, c: Cal): boolean => { const u = userOf(req); return !!u && (u.isAdmin || u.username === c.createdBy); };

async function calendarBySlug(slug: unknown): Promise<Cal | null> {
  const s = String(slug ?? "").toLowerCase().slice(0, 60);
  return s ? prisma.calendar.findUnique({ where: { slug: s }, select: CAL }) : null;
}
/** Opens the calendar: an admin, a member or the creator (signed in), anyone for an open calendar, or the holder of a valid token. */
function allowed(req: FastifyRequest, c: Cal): boolean {
  if (!c.passwordHash || isAdminReq(req) || memberOf(req, c)) return true;
  const t = readCalendarToken(req.headers["x-calendar-token"] as string | undefined);
  return !!t && t.c === c.id && t.v === c.tokenVersion;
}
/** Changes events: anyone who may open it, in "guests" mode; in "members" mode the admin, the creator and the members. */
function editsCal(req: FastifyRequest, c: Cal): boolean {
  if (!allowed(req, c)) return false;
  return c.editMode === "guests" || isAdminReq(req) || memberOf(req, c);
}
const body = (req: FastifyRequest): Record<string, unknown> => (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {});

/** The change tape keeps this many lines per calendar; the oldest go as new ones come. */
const TAPE_KEEP = 300;
/** Writes one line to the change tape. `who`: the signed-in username, else the name the guest typed, else empty (shown as "a guest"). */
async function noteChange(calId: number, action: "added" | "moved" | "changed" | "cancelled" | "skipped" | "back", title: string, who: string): Promise<void> {
  await prisma.calendarChange.create({ data: { calendarId: calId, action, title: title.slice(0, 120), who: who.slice(0, 80) } });
  const cut = await prisma.calendarChange.findFirst({ where: { calendarId: calId }, orderBy: { id: "desc" }, skip: TAPE_KEEP, select: { id: true } });
  if (cut) await prisma.calendarChange.deleteMany({ where: { calendarId: calId, id: { lte: cut.id } } });
}
const whoOf = (req: FastifyRequest, typed: string): string => userOf(req)?.username || typed;

/** Site accounts by username, in any case; each comes back as the account writes it. A name with no account is refused. */
async function resolveMembers(raw: unknown): Promise<Checked<string[]>> {
  const c = checkMembers(raw);
  if (!c.ok || c.value.length === 0) return c;
  const rows = await prisma.user.findMany({
    where: { isGhost: false, deletedAt: null, OR: c.value.map((n) => ({ username: { equals: n, mode: "insensitive" as const } })) },
    select: { username: true },
  });
  const found = new Map(rows.map((r) => [r.username.toLowerCase(), r.username]));
  const missing = c.value.find((n) => !found.has(n.toLowerCase()));
  if (missing !== undefined) return { ok: false, error: `No account is called “${missing}”.` };
  return { ok: true, value: c.value.map((n) => found.get(n.toLowerCase()) as string) };
}

/** Removes pictures, oldest first, until at most `limit` are kept. A picture goes with the oldest event that has one (the event
 *  keeps its text and loses the picture); a picture no event uses goes before any of those. Returns how many went. */
async function trimPictures(tx: Prisma.TransactionClient, calId: number, limit: number): Promise<number> {
  let count = await tx.calendarImage.count({ where: { calendarId: calId } });
  let removed = 0;
  while (count > limit) {
    const ev = await tx.calendarEvent.findFirst({ where: { calendarId: calId, imageId: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { imageId: true } });
    const victim = ev?.imageId ?? (await tx.calendarImage.findFirst({ where: { calendarId: calId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } }))?.id;
    if (victim == null) break;
    await tx.calendarImage.delete({ where: { id: victim } }); // the event's imageId is cleared by the database (SetNull)
    count -= 1; removed += 1;
  }
  return removed;
}

/** Stores a picture. The calendar row is locked first, so two uploads cannot both think there is room; past the cap the oldest goes. */
async function keepPicture(calId: number, cap: number, mime: string, bytes: Buffer): Promise<{ row: { id: number; key: string }; removed: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "calendars" WHERE id = ${calId} FOR UPDATE`;
    const removed = await trimPictures(tx, calId, cap - 1);
    const row = await tx.calendarImage.create({ data: { calendarId: calId, key: newImageKey(), mime, bytes: new Uint8Array(bytes) }, select: { id: true, key: true } });
    return { row, removed };
  });
}

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // The calendars this caller may open: the open ones; a signed-in member's or creator's protected ones too; an admin sees all.
  app.get("/api/calendars", async (req) => {
    const u = userOf(req);
    const where: Prisma.CalendarWhereInput = u?.isAdmin ? {} : u ? { OR: [{ passwordHash: null }, { members: { has: u.username } }, { createdBy: u.username }] } : { passwordHash: null };
    const rows = await prisma.calendar.findMany({ where, orderBy: { createdAt: "asc" }, take: 200, select: { ...CAL, _count: { select: { events: true } } } });
    return { calendars: rows.map((c) => ({ ...calOut(c), events: c._count.events })), canCreate: !!u?.isAdmin || process.env.CALENDAR_OPEN_CREATE === "1" };
  });

  app.get<{ Params: { slug: string } }>("/api/calendars/:slug", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    return viewOf(req, cal);
  });

  // The password from the link, checked here. A right one gives a token, valid 30 days and until the password changes.
  app.post("/api/calendars/enter", async (req, reply) => {
    const b = body(req);
    const slug = String(b.slug ?? "").toLowerCase().slice(0, 60), pass = String(b.password ?? "").slice(0, 300);
    const ipKey = `ip:${req.ip}`, slugKey = `${req.ip}:${slug}`;
    const wait = Math.max(enterPerIp.blocked(ipKey), enterPerSlug.blocked(slugKey));
    if (wait > 0) return fail(reply, 429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 90 ? "s" : ""}.`);
    const cal = await calendarBySlug(slug);
    const ok = await argon2.verify(cal?.passwordHash ?? (await DUMMY), pass).catch(() => false);
    if (!cal || !cal.passwordHash || !ok) { enterPerSlug.fail(slugKey); enterPerIp.fail(ipKey); return fail(reply, 401, "Wrong calendar or password."); }
    enterPerSlug.clear(slugKey);
    return { token: signCalendarToken(cal.id, cal.tokenVersion), calendar: calOut(cal) };
  });

  // Create: the site's admin, or anyone when CALENDAR_OPEN_CREATE=1 (the same switch as Outreach's). The creator is remembered by
  // username when signed in. Only the admin sets the picture cap at creation; everyone else gets the default.
  app.post("/api/calendars", async (req, reply) => {
    const me = userOf(req);
    if (!me?.isAdmin && process.env.CALENDAR_OPEN_CREATE !== "1") return fail(reply, 403, "Only the site's admin can create a calendar.");
    const b = body(req);
    const name = checkName(b.name); if (!name.ok) return fail(reply, 400, name.error);
    const slug = checkSlug(b.slug ? b.slug : slugify(name.value)); if (!slug.ok) return fail(reply, 400, slug.error);
    const tz = checkTimezone(b.timezone || "Europe/Paris"); if (!tz.ok) return fail(reply, 400, tz.error);
    const pass = b.password ? checkPassword(b.password) : null; if (pass && !pass.ok) return fail(reply, 400, pass.error);
    const mode = checkEditMode(b.editMode ?? "guests"); if (!mode.ok) return fail(reply, 400, mode.error);
    const members = b.members === undefined ? ({ ok: true, value: [] } as Checked<string[]>) : await resolveMembers(b.members);
    if (!members.ok) return fail(reply, 400, members.error);
    const cap: Checked<number> = me?.isAdmin && b.pictureCap !== undefined ? checkCap(b.pictureCap) : { ok: true, value: DEFAULT_PICTURE_CAP };
    if (!cap.ok) return fail(reply, 400, cap.error);
    if (await prisma.calendar.findUnique({ where: { slug: slug.value }, select: { id: true } })) return fail(reply, 409, "That address is taken.");
    const cal = await prisma.calendar.create({
      data: { slug: slug.value, name: name.value, timezone: tz.value, passwordHash: pass ? await argon2.hash(pass.value) : null, editMode: mode.value, members: members.value, pictureCap: cap.value, createdBy: me?.username ?? "" },
      select: CAL,
    });
    return reply.code(201).send({ calendar: viewOf(req, cal), token: cal.passwordHash ? signCalendarToken(cal.id, cal.tokenVersion) : undefined });
  });

  // Settings and renames. Editors (see editsCal) change the name, time zone and password; the creator or the admin change who may
  // edit (edit mode, members); the admin alone changes the picture cap, and a lower cap removes the oldest pictures at once.
  // A password change (or clearing) needs the current password, unless the caller is the admin; every change signs everyone else out.
  app.patch<{ Params: { slug: string } }>("/api/calendars/:slug", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const b = body(req);
    const data: Prisma.CalendarUpdateInput = {};
    if (b.editMode !== undefined || b.members !== undefined) {
      if (!managesCal(req, cal)) return fail(reply, 403, "Only the creator or the site's admin can change who may edit.");
    }
    if (b.editMode !== undefined) { const m = checkEditMode(b.editMode); if (!m.ok) return fail(reply, 400, m.error); data.editMode = m.value; }
    if (b.members !== undefined) { const m = await resolveMembers(b.members); if (!m.ok) return fail(reply, 400, m.error); data.members = m.value; }
    if (b.pictureCap !== undefined) {
      if (!isAdminReq(req)) return fail(reply, 403, "Only the site's admin can change the picture cap.");
      const c = checkCap(b.pictureCap); if (!c.ok) return fail(reply, 400, c.error); data.pictureCap = c.value;
    }
    if (b.name !== undefined) { const n = checkName(b.name); if (!n.ok) return fail(reply, 400, n.error); data.name = n.value; }
    if (b.timezone !== undefined) { const t = checkTimezone(b.timezone); if (!t.ok) return fail(reply, 400, t.error); data.timezone = t.value; }
    if (b.password !== undefined) {
      const admin = isAdminReq(req);
      if (!admin && !cal.passwordHash) return fail(reply, 403, "Only the site's admin can put a password on an open calendar.");
      if (!admin && !(await argon2.verify(cal.passwordHash!, String(b.currentPassword ?? "")).catch(() => false))) return fail(reply, 403, "The current password is wrong.");
      if (b.password === null || b.password === "") data.passwordHash = null;
      else { const p = checkPassword(b.password); if (!p.ok) return fail(reply, 400, p.error); data.passwordHash = await argon2.hash(p.value); }
      data.tokenVersion = { increment: 1 };
    }
    const upd = await prisma.$transaction(async (tx) => {
      const u = await tx.calendar.update({ where: { id: cal.id }, data, select: CAL });
      if (b.pictureCap !== undefined) await trimPictures(tx, cal.id, u.pictureCap);
      return u;
    });
    return { calendar: viewOf(req, upd), token: upd.passwordHash ? signCalendarToken(upd.id, upd.tokenVersion) : undefined };
  });

  // Signs everyone out (everyone but the caller gets a new token; the caller keeps working with the one returned).
  app.post<{ Params: { slug: string } }>("/api/calendars/:slug/sign-out-everyone", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const upd = await prisma.calendar.update({ where: { id: cal.id }, data: { tokenVersion: { increment: 1 } }, select: CAL });
    return { token: upd.passwordHash ? signCalendarToken(upd.id, upd.tokenVersion) : undefined };
  });

  // The subscription feed (idea 10, fix420): the whole calendar as an .ics file that a calendar app keeps in step with the site. An open
  // calendar's feed is readable by anyone with its address; a protected one needs its key (the `k` in the link) or a way in as usual.
  app.get<{ Params: { slug: string }; Querystring: { k?: string } }>("/api/calendars/:slug/feed.ics", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return reply.code(404).type("text/plain; charset=utf-8").send("No calendar at this address.");
    if (cal.passwordHash && !keyMatches(cal.feedKey, req.query.k) && !allowed(req, cal)) return reply.code(401).type("text/plain; charset=utf-8").send(LOCKED);
    const rows = await prisma.calendarEvent.findMany({ where: { calendarId: cal.id }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: FEED_MAX, select: FEED_EVENT });
    const text = feedOf(rows.map(feedRow), { slug: cal.slug, name: cal.name, timezone: cal.timezone }, Date.now());
    reply.header("Cache-Control", cal.passwordHash ? "private, max-age=900" : "public, max-age=900");
    return reply.type("text/calendar; charset=utf-8").send(text);
  });

  // The key of a protected calendar's subscription link. Whoever may open the calendar gets it, and it is made on the first request.
  // Renewing it (a new key, so the old links stop working) is for the creator, the site's admin and the members.
  app.post<{ Params: { slug: string } }>("/api/calendars/:slug/feed-key", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (cal.feedKey && body(req).renew !== true) return { key: cal.feedKey };
    if (cal.feedKey && !(managesCal(req, cal) || memberOf(req, cal))) return fail(reply, 403, "Only the creator, the site's admin or a member can renew the link.");
    const key = newFeedKey();
    await prisma.calendar.update({ where: { id: cal.id }, data: { feedKey: key }, select: { id: true } });
    return { key };
  });

  // Deleting a calendar removes its events and pictures. The admin only.
  app.delete<{ Params: { slug: string } }>("/api/calendars/:slug", async (req, reply) => {
    if (!isAdminReq(req)) return fail(reply, 403, "Only the site's admin can delete a calendar.");
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    await prisma.calendar.delete({ where: { id: cal.id } });
    return reply.code(204).send();
  });

  // Events in a window (ISO `from` and `to`), optionally filtered by words in the title, text or place. Earliest first.
  // `canEdit` tells the page whether this caller may add, change or remove events.
  app.get<{ Params: { slug: string }; Querystring: { from?: string; to?: string; q?: string; limit?: string } }>("/api/calendars/:slug/events", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    const w = checkWindow(req.query.from, req.query.to); if (!w.ok) return fail(reply, 400, w.error);
    const q = String(req.query.q ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 300));
    const and: Prisma.CalendarEventWhereInput[] = [];
    if (w.value.from || w.value.to) {
      // A repeat that began before the window still has days in it, so it is fetched too; the page works out which of its days fall there.
      and.push({ OR: [
        { startsAt: { gte: w.value.from ?? undefined, lte: w.value.to ?? undefined } },
        { recurrence: { not: null }, startsAt: { lte: w.value.to ?? undefined } },
      ] });
    }
    if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { text: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] });
    const where: Prisma.CalendarEventWhereInput = { calendarId: cal.id, AND: and };
    const rows = await prisma.calendarEvent.findMany({ where, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: limit + 1, select: EVENT });
    return { events: rows.slice(0, limit).map(toEvent), truncated: rows.length > limit, calendar: calOut(cal), canEdit: editsCal(req, cal) };
  });

  // Address search for the places: the coordinates and a name for what was typed. Editors and guests alike; the answers are kept a week.
  app.get<{ Params: { slug: string }; Querystring: { q?: string } }>("/api/calendars/:slug/geocode", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return fail(reply, 400, "Type at least two letters of the address.");
    if (!geocodePerIp.hit(`ip:${req.ip}`)) return fail(reply, 429, "Too many address searches. Wait a moment.");
    try {
      return { places: await geocode(q) };
    } catch (e) {
      if (e instanceof GeocodeBusy) return fail(reply, 503, e.message);
      if (e instanceof GeocodeDown) return fail(reply, 503, e.message);
      throw e;
    }
  });

  // Skips one day of a repeat (skipped: true), or puts it back (false). A repeat's own day is the day it falls on in the calendar's zone.
  app.post<{ Params: { slug: string; id: string } }>("/api/calendars/:slug/events/:id/skip", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const id = Number(req.params.id);
    const ev = Number.isInteger(id) ? await prisma.calendarEvent.findFirst({ where: { id, calendarId: cal.id }, select: EVENT }) : null;
    if (!ev) return fail(reply, 404, "No such event.");
    if (!ev.recurrence) return fail(reply, 400, "Only a repeating event has days to skip.");
    const d = checkDay(body(req).day); if (!d.ok) return fail(reply, 400, d.error);
    const skipped = body(req).skipped !== false;
    const set = new Set(ev.exdates);
    if (skipped) set.add(d.value); else set.delete(d.value);
    if (set.size > MAX_SKIPS) return fail(reply, 400, "Too many days are skipped in this repeat.");
    const upd = await prisma.calendarEvent.update({ where: { id: ev.id }, data: { exdates: [...set].sort() }, select: EVENT });
    await noteChange(cal.id, skipped ? "skipped" : "back", ev.title, whoOf(req, ""));
    return toEvent(upd);
  });

  // The change tape: the latest changes to a calendar, newest first. Whoever may open the calendar sees them.
  app.get<{ Params: { slug: string }; Querystring: { limit?: string } }>("/api/calendars/:slug/changes", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const rows = await prisma.calendarChange.findMany({ where: { calendarId: cal.id }, orderBy: { id: "desc" }, take: limit, select: { id: true, action: true, title: true, who: true, at: true } });
    return { changes: rows.map((r) => ({ id: r.id, action: r.action, title: r.title, who: r.who, at: r.at.toISOString() })) };
  });

  app.post<{ Params: { slug: string } }>("/api/calendars/:slug/events", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const wkey = `${req.ip}:${cal.id}`;
    if (writePerKey.blocked(wkey) > 0) return fail(reply, 429, "Too many changes in a short time. Wait a moment.");
    writePerKey.fail(wkey);
    const c = checkEvent(req.body); if (!c.ok) return fail(reply, 400, c.error);
    if (c.value.recurUntil && c.value.recurUntil < dayKeyIn(c.value.startsAt, cal.timezone)) return fail(reply, 400, "The repeat ends before it starts.");
    if (await prisma.calendarEvent.count({ where: { calendarId: cal.id } }) >= MAX_EVENTS) return fail(reply, 409, "This calendar is full.");
    if (c.value.imageId !== null && !(await prisma.calendarImage.findFirst({ where: { id: c.value.imageId, calendarId: cal.id }, select: { id: true } }))) return fail(reply, 400, "That picture is not in this calendar.");
    const ev = await prisma.calendarEvent.create({ data: { calendarId: cal.id, title: c.value.title, text: c.value.text, url: c.value.url, location: c.value.location, startsAt: c.value.startsAt, endsAt: c.value.endsAt, allDay: c.value.allDay, addedBy: c.value.addedBy, imageId: c.value.imageId, lat: c.value.lat, lng: c.value.lng, recurrence: c.value.recurrence, recurUntil: c.value.recurUntil }, select: EVENT });
    await noteChange(cal.id, "added", ev.title, whoOf(req, c.value.addedBy));
    return reply.code(201).send(toEvent(ev));
  });

  app.put<{ Params: { slug: string; id: string } }>("/api/calendars/:slug/events/:id", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return fail(reply, 404, "No such event.");
    const before = await prisma.calendarEvent.findFirst({ where: { id, calendarId: cal.id }, select: { id: true, startsAt: true } });
    if (!before) return fail(reply, 404, "No such event.");
    const c = checkEvent(req.body); if (!c.ok) return fail(reply, 400, c.error);
    if (c.value.recurUntil && c.value.recurUntil < dayKeyIn(c.value.startsAt, cal.timezone)) return fail(reply, 400, "The repeat ends before it starts.");
    if (c.value.imageId !== null && !(await prisma.calendarImage.findFirst({ where: { id: c.value.imageId, calendarId: cal.id }, select: { id: true } }))) return fail(reply, 400, "That picture is not in this calendar.");
    // A repeat that stops repeating forgets its skipped days; one that keeps repeating keeps them.
    const data = { title: c.value.title, text: c.value.text, url: c.value.url, location: c.value.location, startsAt: c.value.startsAt, endsAt: c.value.endsAt, allDay: c.value.allDay, imageId: c.value.imageId, addedBy: c.value.addedBy, lat: c.value.lat, lng: c.value.lng, recurrence: c.value.recurrence, recurUntil: c.value.recurUntil, exdates: c.value.recurrence ? undefined : [] };
    const ev = await prisma.calendarEvent.update({ where: { id }, data, select: EVENT });
    await noteChange(cal.id, before.startsAt.getTime() !== new Date(c.value.startsAt).getTime() ? "moved" : "changed", ev.title, whoOf(req, c.value.addedBy));
    return toEvent(ev);
  });

  app.delete<{ Params: { slug: string; id: string } }>("/api/calendars/:slug/events/:id", async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const gone = await prisma.calendarEvent.findFirst({ where: { id: Number(req.params.id), calendarId: cal.id }, select: { title: true } });
    await prisma.calendarEvent.deleteMany({ where: { id: Number(req.params.id), calendarId: cal.id } });
    if (gone) await noteChange(cal.id, "cancelled", gone.title, whoOf(req, ""));
    return reply.code(204).send();
  });

  // A preview picture from the device: base64 of a PNG, JPEG or WebP up to 1 MB. Past the calendar's cap the oldest picture goes;
  // the reply says how many went (`removed`).
  app.post<{ Params: { slug: string } }>("/api/calendars/:slug/images", { bodyLimit: 1_500_000 }, async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const raw = String(body(req).data ?? "").replace(/^data:image\/[a-z]+;base64,/, "");
    if (!raw || raw.length > IMAGE_MAX_BYTES * 1.4 || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return fail(reply, 400, "The picture is not a valid image.");
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length > IMAGE_MAX_BYTES) return fail(reply, 413, "The picture is larger than 1 MB.");
    const mime = sniffImage(bytes);
    if (!mime) return fail(reply, 400, "Only PNG, JPEG and WebP pictures are kept.");
    const { row, removed } = await keepPicture(cal.id, cal.pictureCap, mime, bytes);
    return reply.code(201).send({ id: row.id, url: imageUrl(row.id, row.key), removed });
  });

  // The picture itself. Its random key is only in the events its readers can see.
  app.get<{ Params: { id: string; key: string } }>("/api/calendar-images/:id/:key", async (req, reply) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? await prisma.calendarImage.findUnique({ where: { id }, select: { key: true, mime: true, bytes: true } }) : null;
    if (!row || row.key !== req.params.key) return reply.code(404).send({ error: "not found" });
    return reply.type(row.mime).header("cache-control", "private, max-age=86400").send(Buffer.from(row.bytes));
  });

  // Reads a page a guest pasted: its title, text, site, address and picture. The picture is kept here (under the cap), so the page never loads other sites.
  app.post<{ Params: { slug: string } }>("/api/calendars/:slug/link-preview", { bodyLimit: 8192 }, async (req, reply) => {
    const cal = await calendarBySlug(req.params.slug);
    if (!cal) return fail(reply, 404, "No calendar at this address.");
    if (!allowed(req, cal)) return fail(reply, 401, LOCKED);
    if (!editsCal(req, cal)) return fail(reply, 403, NOT_EDITOR);
    const ipKey = `ip:${req.ip}`, calKey = `${req.ip}:${cal.id}`;
    const wait = Math.max(previewPerIp.blocked(ipKey), previewPerKey.blocked(calKey));
    if (wait > 0) return fail(reply, 429, "Too many links in a short time. Wait a few minutes.");
    const u = checkUrl(body(req).url);
    if (!u.ok) return fail(reply, 400, u.error);
    if (!u.value) return fail(reply, 400, "Paste a link first.");
    previewPerIp.fail(ipKey); previewPerKey.fail(calKey);
    let page;
    try { page = await fetchPage(u.value, 512_000, (t) => t === "text/html" || t === "application/xhtml+xml"); }
    catch (e) { return fail(reply, 422, msgOf(e)); }
    const pv = parsePreview(page.body.toString("utf8"), page.url);
    const sameHost = pv.canonical && new URL(pv.canonical).host === new URL(page.url).host;
    let image: { id: number; url: string } | null = null;
    let removed = 0;
    if (pv.image) {
      try {
        const img = await fetchPage(pv.image, IMAGE_MAX_BYTES, (t) => t.startsWith("image/"));
        const mime = sniffImage(img.body);
        if (mime) { const kept = await keepPicture(cal.id, cal.pictureCap, mime, img.body); image = { id: kept.row.id, url: imageUrl(kept.row.id, kept.row.key) }; removed = kept.removed; }
      } catch { /* no picture: the link itself still works */ }
    }
    return { url: sameHost ? (pv.canonical as string) : page.url, title: pv.title, description: pv.description, siteName: pv.siteName, image, removed };
  });
}
