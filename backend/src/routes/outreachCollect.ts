import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { cleanCell, dateOnly, isEmail } from "../lib/outreach.js";
import { feedLead, findPeople, formQuestionsText, isGoogleFormUrl, looksLikeCall, parseFeed, parseForm, splitNewsletter, teamLinks, type FoundCall, type FormInfo } from "../lib/outreachCollect.js";
import { findDeadline, findEmails, htmlToText, readOpportunity } from "../lib/outreachPlus.js";
import { findPlace, geocode } from "../lib/geo.js";
import { scanInbox } from "../lib/outreachImap.js";
import type { MailAccount } from "../lib/outreachMail.js";
import { dncHit } from "../lib/outreachRules.js";
import type { ScopedDb } from "../lib/outreachScopeDb.js";
import { dbFor, ensureColumns, fail, fetchPage, shapeContact, today, WITH_GROUPS, type workspaceAuth } from "./outreachShared.js";

type Pre = { preHandler: typeof workspaceAuth };
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "orange.fr", "free.fr", "wanadoo.fr", "laposte.net", "web.de", "t-online.de"]);
const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/** Contacts the same call may already live under: same address, or the same site (shared webmail domains don't count). */
async function findExisting(db: ScopedDb, emails: string[], url: string | null): Promise<{ id: number; name: string; email: string }[]> {
  const doms = [...new Set(emails.map((e) => e.slice(e.lastIndexOf("@") + 1)).filter((d) => d && !FREE_MAIL.has(d)))];
  if (url) { const h = hostOf(url); if (h && !FREE_MAIL.has(h)) doms.push(h); }
  const or = [...emails.map((e) => ({ email: e })), ...doms.map((d) => ({ email: { endsWith: `@${d}` } }))];
  const linkCol = (await db.outreachColumn.findMany({ where: { type: "url" } })).map((c) => c.key);
  const rows = or.length ? await db.outreachContact.findMany({ where: { OR: or }, take: 8, select: { id: true, name: true, email: true } }) : [];
  if (url && linkCol.length) {
    const h = hostOf(url);
    for (const c of await db.outreachContact.findMany({ select: { id: true, name: true, email: true, data: true } })) {
      if (rows.some((r) => r.id === c.id)) continue; const d = (c.data ?? {}) as Record<string, unknown>;
      if (linkCol.some((k) => typeof d[k] === "string" && (d[k] === url || (h && hostOf(d[k] as string) === h)))) rows.push({ id: c.id, name: c.name, email: c.email });
      if (rows.length >= 8) break;
    }
  }
  return rows.slice(0, 5);
}

/** A found call becomes a contact in the sheet (status "lead"), with Link, Fee and Form columns made on demand. */
export async function leadToContact(db: ScopedDb, ws: { dnc: unknown }, l: { title: string; url: string; summary: string; deadline: Date | null; fee: string | null; place: string; emails: unknown; fields: unknown; source: string }): Promise<number> {
  const mails = ((Array.isArray(l.emails) ? l.emails : []) as string[]).filter((e) => isEmail(e) && !dncHit(ws.dnc, e));
  const fill: { name: string; type: string; value: unknown }[] = [];
  if (l.url) fill.push({ name: "Link", type: "url", value: l.url });
  if (l.fee) fill.push({ name: "Fee", type: "text", value: l.fee });
  const form = (Array.isArray(l.fields) ? l.fields : []) as FormInfo["fields"];
  if (form.length) fill.push({ name: "Form questions", type: "longtext", value: formQuestionsText({ kind: "google", title: "", description: "", fields: form }) });
  const keys = await ensureColumns(db, fill.map((f) => ({ name: f.name, type: f.type }))); const cols = await db.outreachColumn.findMany(); const data: Record<string, unknown> = {};
  for (const f of fill) { const k = keys.get(f.name); const col = cols.find((c) => c.key === k); if (!k || !col) continue; const v = cleanCell(col.type, col.options, f.value); if (v !== null && v !== "") data[k] = v; }
  const ll = l.place ? await geocode(l.place) : null;
  const c = await db.outreachContact.create({ data: { name: l.title.slice(0, 120), email: mails[0] ?? "", data: data as object, status: "lead", deadline: l.deadline, source: l.source.slice(0, 20), place: l.place, lat: ll?.lat ?? null, lng: ll?.lng ?? null } });
  return c.id;
}

export async function outreachCollectRoutes(app: FastifyInstance, W: Pre): Promise<void> {
  // ---- reading a call from a link or pasted text: dates, fee, place, and the questions when it is a form
  app.post<{ Body: { url?: string; text?: string } }>("/api/outreach/capture", { ...W, bodyLimit: 512 * 1024 }, async (req, reply) => {
    const db = req.db; const b = req.body ?? {}; const url = typeof b.url === "string" ? b.url.trim() : "";
    let html = "", text = "", finalUrl: string | null = null;
    if (url) { const page = await fetchPage(url); if (typeof page === "string") return fail(reply, 422, page); html = page.html; finalUrl = page.finalUrl; }
    else if (typeof b.text === "string" && b.text.trim()) text = b.text.slice(0, 200_000);
    else return fail(reply, 400, "Paste a link or the text of the call.");
    const opp = readOpportunity(html ? { html, url: finalUrl } : { text }, today());
    let form: FormInfo | null = null;
    if (html && (isGoogleFormUrl(finalUrl ?? "") || /FB_PUBLIC_LOAD_DATA_|<form\b/i.test(html))) { const f = parseForm(html); if (f.fields.length || f.kind === "google") form = f; }
    if (form) {
      const blurb = `${form.title}\n${form.description}`;
      if (!opp.deadline) opp.deadline = findDeadline(blurb, today());
      if (form.kind === "google" && form.title) opp.title = form.title;
      opp.emails = [...new Set([...opp.emails, ...findEmails(form.description)])].slice(0, 8);
    }
    const pl = findPlace(html, text || htmlToText(html));
    const existing = await findExisting(db, opp.emails, finalUrl);
    return { ...opp, place: pl.place, lat: pl.lat, lng: pl.lng, form, existing, blocked: opp.emails.length > 0 && opp.emails.every((e) => dncHit(req.ox.dnc, e)) };
  });

  app.post<{ Body: { q?: string } }>("/api/outreach/geocode", W, async (req, reply) => {
    const q = String(req.body?.q ?? "").trim(); if (!q) return fail(reply, 400, "Type a city, an address or coordinates.");
    const r = await geocode(q); return r ?? fail(reply, 404, "Nothing found for that. Try a bigger place name, or coordinates like 48.85, 2.35.");
  });

  // ---- the "New" inbox
  const shapeLead = (l: { id: number; title: string; url: string; summary: string; deadline: Date | null; fee: string | null; place: string; emails: unknown; fields: unknown; source: string; status: string; foundAt: Date }) => ({ id: l.id, title: l.title, url: l.url, summary: l.summary, deadline: l.deadline?.toISOString().slice(0, 10) ?? null, fee: l.fee, place: l.place, emails: l.emails, fields: l.fields, source: l.source, status: l.status, foundAt: l.foundAt.toISOString().slice(0, 10) });
  app.get<{ Querystring: { status?: string } }>("/api/outreach/leads", W, async (req) => {
    const rows = await req.db.outreachLead.findMany({ where: { status: req.query.status === "kept" || req.query.status === "dismissed" ? req.query.status : "new" }, orderBy: { foundAt: "desc" }, take: 300 });
    return rows.map(shapeLead);
  });
  type LeadIn = { title?: string; url?: string; summary?: string; deadline?: string | null; fee?: string | null; place?: string; emails?: string[]; fields?: unknown; source?: string };
  const leadData = (b: LeadIn, source: string) => {
    const title = (b.title ?? "").trim().slice(0, 140); const url = (b.url ?? "").trim().slice(0, 500); const dl = dateOnly(b.deadline ?? undefined);
    return title ? { title, url, summary: (b.summary ?? "").slice(0, 600), deadline: dl ? new Date(`${dl}T00:00:00Z`) : null, fee: b.fee ? String(b.fee).slice(0, 40) : null, place: (b.place ?? "").slice(0, 160), emails: (Array.isArray(b.emails) ? b.emails.filter(isEmail).slice(0, 8) : []) as object, fields: (Array.isArray(b.fields) ? b.fields.slice(0, 80) : []) as object, source, key: (url || title).toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "").slice(0, 300) } : null;
  };
  app.post<{ Body: LeadIn }>("/api/outreach/leads", { ...W, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const d = leadData(req.body ?? {}, ["form", "bookmarklet", "newsletter", "feed"].includes(String(req.body?.source)) ? String(req.body?.source) : "bookmarklet"); if (!d) return fail(reply, 400, "A call needs a title.");
    const have = await req.db.outreachLead.findFirst({ where: { key: d.key } }); if (have) return reply.send({ ...shapeLead(have), already: true });
    return reply.code(201).send(shapeLead(await req.db.outreachLead.create({ data: d })));
  });
  app.post<{ Body: { ids?: number[]; action?: string } }>("/api/outreach/leads/act", W, async (req, reply) => {
    const db = req.db; const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list.");
    if (req.body?.action === "dismiss") { const r = await db.outreachLead.updateMany({ where: { id: { in: ids } }, data: { status: "dismissed" } }); return { dismissed: r.count }; }
    if (req.body?.action !== "keep") return fail(reply, 400, "Unknown action.");
    const rows = await db.outreachLead.findMany({ where: { id: { in: ids }, status: "new" } }); const made: ReturnType<typeof shapeContact>[] = [];
    for (const l of rows) { const id = await leadToContact(db, req.ox, l); await db.outreachLead.update({ where: { id: l.id }, data: { status: "kept" } }); const c = await db.outreachContact.findUnique({ where: { id }, include: WITH_GROUPS }); if (c) made.push(shapeContact(c)); }
    return { contacts: made };
  });
  app.post<{ Body: { text?: string } }>("/api/outreach/newsletter", { ...W, bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const text = String(req.body?.text ?? ""); if (text.trim().length < 40) return fail(reply, 400, "Paste the newsletter's text.");
    const found = splitNewsletter(text, today()); if (!found.length) return { found: 0, added: 0, leads: [] };
    return ingestCalls(req.db, found, "newsletter");
  });

  // ---- feeds
  app.get("/api/outreach/feeds", W, async (req) => (await req.db.outreachFeed.findMany({ orderBy: { id: "asc" } })).map((f) => ({ id: f.id, url: f.url, title: f.title, active: f.active, lastCheckedAt: f.lastCheckedAt?.toISOString() ?? null, error: f.error })));
  app.post<{ Body: { url?: string } }>("/api/outreach/feeds", W, async (req, reply) => {
    const db = req.db; const url = String(req.body?.url ?? "").trim(); if (!url) return fail(reply, 400, "Paste the feed's address.");
    if ((await db.outreachFeed.count()) >= 20) return fail(reply, 409, "A workspace watches 20 feeds at most.");
    const page = await fetchPage(url, { feed: true }); if (typeof page === "string") return fail(reply, 422, page);
    const parsed = parseFeed(page.html); if (!parsed.items.length) return fail(reply, 422, "That doesn't look like an RSS or Atom feed (no entries found).");
    const f = await db.outreachFeed.create({ data: { url: page.finalUrl, title: parsed.title || hostOf(page.finalUrl) } });
    await ingestFeed(db, f.id, parsed.items);
    return reply.code(201).send({ id: f.id, url: f.url, title: f.title, active: true, lastCheckedAt: new Date().toISOString(), error: null });
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/feeds/:id", W, async (req) => { await req.db.outreachFeed.deleteMany({ where: { id: Number(req.params.id) || 0 } }); return { ok: true }; });
  app.post("/api/outreach/feeds/check", W, async (req) => ({ added: await checkWorkspaceFeeds(req.ox.id, true) }));

  // ---- people on the team page, offered to fill the contact in (nothing is written here)
  app.post<{ Body: { contactId?: number; url?: string } }>("/api/outreach/enrich", W, async (req, reply) => {
    const db = req.db; const c = Number.isInteger(req.body?.contactId) ? await db.outreachContact.findUnique({ where: { id: req.body!.contactId as number } }) : null;
    let url = String(req.body?.url ?? "").trim();
    if (!url && c) { const links = await db.outreachColumn.findMany({ where: { type: "url" } }); const d = (c.data ?? {}) as Record<string, unknown>; url = links.map((l) => d[l.key]).find((v): v is string => typeof v === "string" && !!v) ?? (c.email && !FREE_MAIL.has(c.email.slice(c.email.lastIndexOf("@") + 1)) ? `https://${c.email.slice(c.email.lastIndexOf("@") + 1)}` : ""); }
    if (!url) return fail(reply, 400, "Give a website: there is none on this contact.");
    const first = await fetchPage(url); if (typeof first === "string") return fail(reply, 422, first);
    const pages = [first]; for (const u of teamLinks(first.html, first.finalUrl)) { const p = await fetchPage(u); if (typeof p !== "string") pages.push(p); }
    const people = new Map<string, ReturnType<typeof findPeople>[number]>(); const mails = new Set<string>();
    for (const p of pages) { const t = htmlToText(p.html); for (const x of findPeople(t)) if (!people.has(x.name.toLowerCase())) people.set(x.name.toLowerCase(), x); for (const e of findEmails(`${t}\n${p.html}`)) mails.add(e); }
    return { site: first.finalUrl, pages: pages.length, people: [...people.values()], emails: [...mails].slice(0, 10) };
  });

  // ---- merging duplicates: the page decides every field, the server keeps one row and moves everything else over
  type MergeBody = { keepId?: number; ids?: number[]; values?: { name?: string; email?: string; status?: string; deadline?: string | null; followUpAt?: string | null; lastSentAt?: string | null; sentCount?: number; timezone?: string; place?: string; lat?: number | null; lng?: number | null; groups?: number[]; data?: Record<string, unknown> } };
  app.post<{ Body: MergeBody }>("/api/outreach/contacts/merge", { ...W, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const db = req.db; const b = req.body ?? {}; const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter(Number.isInteger))] : [];
    if (!Number.isInteger(b.keepId) || ids.length < 2 || !ids.includes(b.keepId as number) || ids.length > 12) return fail(reply, 400, "Choose the contacts to merge and the one to keep.");
    const rows = await db.outreachContact.findMany({ where: { id: { in: ids } } }); if (rows.length !== ids.length) return fail(reply, 404, "A contact to merge is gone.");
    const v = b.values ?? {}; const keep = b.keepId as number; const others = ids.filter((x) => x !== keep);
    const cols = await db.outreachColumn.findMany(); const data: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(v.data ?? {})) { const col = cols.find((c) => c.key === k); if (!col) continue; const x = cleanCell(col.type, col.options, raw); if (x !== null && x !== "" && !(Array.isArray(x) && !x.length) && x !== false) data[k] = x; }
    const d = (s: unknown): Date | null => { const x = typeof s === "string" ? dateOnly(s) : null; return x ? new Date(`${x}T00:00:00Z`) : null; };
    const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : ""; const gids = Array.isArray(v.groups) ? v.groups.filter(Number.isInteger) : [];
    const realGroups = gids.length ? await db.outreachGroup.findMany({ where: { id: { in: gids } }, select: { id: true } }) : [];
    const lat = Number(v.lat), lng = Number(v.lng); const hasLL = v.lat !== null && v.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const doNot = rows.some((r) => r.doNotContact);
    await db.$transaction([
      db.outreachSend.updateMany({ where: { contactId: { in: others } }, data: { contactId: keep } }),
      db.outreachScheduled.updateMany({ where: { contactId: { in: others } }, data: { contactId: keep } }),
      db.outreachMessage.updateMany({ where: { contactId: { in: others } }, data: { contactId: keep } }),
      db.outreachLink.updateMany({ where: { contactId: { in: others } }, data: { contactId: keep } }),
      db.outreachContact.deleteMany({ where: { id: { in: others } } }),
      db.outreachContact.update({ where: { id: keep }, data: {
        name: typeof v.name === "string" ? v.name.trim().slice(0, 120) : undefined, email: email && isEmail(email) ? email : email === "" ? "" : undefined,
        status: typeof v.status === "string" ? v.status : undefined, deadline: "deadline" in v ? d(v.deadline) : undefined, followUpAt: "followUpAt" in v ? d(v.followUpAt) : undefined, lastSentAt: "lastSentAt" in v ? d(v.lastSentAt) : undefined,
        sentCount: Number.isFinite(Number(v.sentCount)) ? Math.max(0, Math.min(9999, Math.round(Number(v.sentCount)))) : undefined, timezone: typeof v.timezone === "string" ? v.timezone || null : undefined,
        place: typeof v.place === "string" ? v.place.slice(0, 160) : undefined, ...(hasLL ? { lat, lng } : "lat" in v ? { lat: null, lng: null } : {}), doNotContact: doNot, data: data as object, groups: { set: realGroups },
      } }),
    ]);
    const out = await db.outreachContact.findUnique({ where: { id: keep }, include: WITH_GROUPS });
    return { contact: out ? shapeContact(out) : null, removed: others };
  });
}

// ---------------------------------------------------------------- feeds, checked by the minute loop
async function ingestFeed(db: ScopedDb, feedId: number, items: ReturnType<typeof parseFeed>["items"]): Promise<number> {
  const calls: FoundCall[] = items.filter((i) => looksLikeCall(i.title, i.summary)).slice(0, 30).map((i) => feedLead(i, today()));
  if (!calls.length) return 0;
  const have = new Set((await db.outreachLead.findMany({ where: { key: { in: calls.map((c) => c.key) } }, select: { key: true } })).map((x) => x.key));
  const fresh = calls.filter((c) => !have.has(c.key) && c.title);
  if (fresh.length) await db.outreachLead.createMany({ data: fresh.map((c) => ({ feedId, title: c.title, url: c.url.slice(0, 500), summary: c.summary, deadline: c.deadline ? new Date(`${c.deadline}T00:00:00Z`) : null, fee: c.fee, emails: c.emails as object, source: "feed", key: c.key.slice(0, 300) })), skipDuplicates: true });
  return fresh.length;
}
async function checkWorkspaceFeeds(workspaceId: number, force = false): Promise<number> {
  const db = dbFor(workspaceId); const stale = new Date(Date.now() - 6 * 3600_000); let added = 0;
  for (const f of await db.outreachFeed.findMany({ where: { active: true, ...(force ? {} : { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: stale } }] }) }, take: 20 })) {
    const page = await fetchPage(f.url, { feed: true });
    if (typeof page === "string") { await db.outreachFeed.update({ where: { id: f.id }, data: { error: page, lastCheckedAt: new Date() } }); continue; }
    added += await ingestFeed(db, f.id, parseFeed(page.html).items);
    await db.outreachFeed.update({ where: { id: f.id }, data: { error: null, lastCheckedAt: new Date() } });
  }
  return added;
}
/** Every six hours per feed, checked from the one-minute loop. */
export async function checkFeeds(): Promise<void> {
  const stale = new Date(Date.now() - 6 * 3600_000);
  const due = await prisma.outreachFeed.findMany({ where: { active: true, workspaceId: { not: null }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: stale } }] }, select: { workspaceId: true }, distinct: ["workspaceId"], take: 5 });
  for (const w of due) if (w.workspaceId !== null) await checkWorkspaceFeeds(w.workspaceId).catch(() => {});
}

// ---------------------------------------------------------------- calls found in mail (a pasted newsletter, .eml files, the inbox check)
/** Calls into the New list; ones already seen (kept or dismissed too) are left alone. */
export async function ingestCalls(db: ScopedDb, found: FoundCall[], source: string): Promise<{ found: number; added: number; already: number }> {
  const calls = found.filter((c) => c.title && c.key); if (!calls.length) return { found: 0, added: 0, already: 0 };
  const have = new Set((await db.outreachLead.findMany({ where: { key: { in: calls.map((c) => c.key.slice(0, 300)) } }, select: { key: true } })).map((x) => x.key));
  const fresh = calls.filter((c) => !have.has(c.key.slice(0, 300)));
  if (fresh.length) await db.outreachLead.createMany({ data: fresh.map((c) => ({ title: c.title.slice(0, 140), url: c.url.slice(0, 500), summary: c.summary.slice(0, 600), deadline: c.deadline ? new Date(`${c.deadline}T00:00:00Z`) : null, fee: c.fee ? c.fee.slice(0, 40) : null, emails: c.emails.filter(isEmail).slice(0, 8) as object, source, key: c.key.slice(0, 300) })), skipDuplicates: true });
  return { found: calls.length, added: fresh.length, already: calls.length - fresh.length };
}

type AcctRow = Awaited<ReturnType<typeof prisma.outreachAccount.findFirstOrThrow>>;
export type ToMail = (a: AcctRow) => MailAccount | string;
/** One mailbox: look at what arrived since last time. Never throws; the outcome is stored on the mailbox. */
export async function checkInbox(a: AcctRow, toMail: ToMail): Promise<{ scanned: number; found: number; added: number; error: string | null }> {
  const m = toMail(a);
  if (typeof m === "string") { await prisma.outreachAccount.update({ where: { id: a.id }, data: { inboxError: m, inboxCheckedAt: new Date() } }); return { scanned: 0, found: 0, added: 0, error: m }; }
  try {
    const own = new Set([a.fromEmail, a.smtpUser].flatMap((x) => (x ? [x.toLowerCase()] : [])));
    const r = await scanInbox(m, { folder: a.inboxFolder, lastUid: a.inboxLastUid, uidValidity: a.inboxValidity, own, today: today() });
    const out = a.workspaceId === null ? { found: 0, added: 0, already: 0 } : await ingestCalls(dbFor(a.workspaceId), r.calls, "inbox");
    await prisma.outreachAccount.update({ where: { id: a.id }, data: { inboxLastUid: r.lastUid, inboxValidity: r.uidValidity || a.inboxValidity, inboxCheckedAt: new Date(), inboxError: null } });
    return { scanned: r.scanned, found: out.found, added: out.added, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "couldn't read the inbox";
    await prisma.outreachAccount.update({ where: { id: a.id }, data: { inboxError: msg, inboxCheckedAt: new Date() } });
    return { scanned: 0, found: 0, added: 0, error: msg };
  }
}
/** Every half hour per mailbox that has it on, from the one-minute loop. */
export async function checkInboxes(toMail: ToMail): Promise<void> {
  const stale = new Date(Date.now() - 30 * 60_000);
  const due = await prisma.outreachAccount.findMany({ where: { inboxOn: true, workspaceId: { not: null }, imapHost: { not: null }, OR: [{ inboxCheckedAt: null }, { inboxCheckedAt: { lt: stale } }] }, take: 3, orderBy: { inboxCheckedAt: "asc" } });
  for (const a of due) await checkInbox(a, toMail).catch(() => {});
}
