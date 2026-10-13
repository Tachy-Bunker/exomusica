import type { FastifyInstance } from "fastify";
import { parse } from "csv-parse/sync";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { seal, unseal } from "../lib/secretBox.js";
import { renderMail } from "../lib/mailMarkdown.js";
import { cleanStatus, computeStats, learn, endsWaiting, expandBlocks, highlightMarks, nextWeekday, readOpportunity, stripMarks, validZone, zonedToUtc, type BlockRef, type VariantRule } from "../lib/outreachPlus.js";
import { buildRaw, deliver, fileCopyInSent, messageIdFor, verifyAccount, type MailAccount } from "../lib/outreachMail.js";
import { cleanDnc, dncHit, linkifyForTracking, quietDays } from "../lib/outreachRules.js";
import type { ScopedDb } from "../lib/outreachScopeDb.js";
import {
  addDays, cleanCell, cleanColumnInput, dateOnly, fieldValues, fillFields, isEmail, MAX_ATTACH_BYTES, MAX_COLUMNS, MAX_RECIPIENTS, parseAddresses, planImport, slugKey, uploadFile, type ColumnDef,
} from "../lib/outreach.js";
import { ensureColumns, fail, fetchPage, shapeContact, today, wait, workspaceAuth, WITH_GROUPS, ymd, dbFor } from "./outreachShared.js";
import { outreachWorkspaceRoutes, sendDigests } from "./outreachWorkspace.js";
import { checkFeeds, checkInbox, checkInboxes, outreachCollectRoutes } from "./outreachCollect.js";
import { outreachEmlRoutes } from "./outreachEml.js";

const SECRET = (): string => process.env.OUTREACH_SECRET ?? process.env.JWT_SECRET ?? "";
const FILE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".pdf", ".zip", ".txt", ".doc", ".docx", ".odt", ".rtf", ".mid", ".midi"]);

type AcctRow = Awaited<ReturnType<typeof prisma.outreachAccount.findFirstOrThrow>>;
export const shapeAccount = (s: AcctRow) => ({
  id: s.id, label: s.label, isDefault: s.isDefault,
  smtpHost: s.smtpHost ?? "", smtpPort: s.smtpPort ?? 465, smtpSecure: s.smtpSecure, smtpUser: s.smtpUser ?? "", hasPassword: !!s.smtpPasswordEnc,
  fromName: s.fromName ?? "", fromEmail: s.fromEmail ?? "", replyTo: s.replyTo ?? "", defaultCc: s.defaultCc ?? "", defaultBcc: s.defaultBcc ?? "",
  imapHost: s.imapHost ?? "", imapPort: s.imapPort ?? 993, imapSecure: s.imapSecure, sentFolder: s.sentFolder, fileInSent: s.fileInSent, signatureMd: s.signatureMd, followUpDays: s.followUpDays,
  inboxOn: s.inboxOn, inboxFolder: s.inboxFolder, inboxCheckedAt: s.inboxCheckedAt?.toISOString() ?? null, inboxError: s.inboxError,
});
/** The workspace's mailboxes; the first visit adopts the old single account (and a fresh workspace gets an empty one). */
export async function accountsOf(db: ScopedDb): Promise<AcctRow[]> {
  let list = await db.outreachAccount.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  if (list.length === 0) { await db.outreachAccount.create({ data: { label: "Main mailbox", isDefault: true } }); list = await db.outreachAccount.findMany({ orderBy: { id: "asc" } }); }
  if (!list.some((a) => a.isDefault)) { await db.outreachAccount.update({ where: { id: list[0].id }, data: { isDefault: true } }); list[0].isDefault = true; }
  return list;
}
export const pickAccount = (list: AcctRow[], id: unknown): AcctRow => (Number.isInteger(id) ? list.find((a) => a.id === id) : undefined) ?? list.find((a) => a.isDefault) ?? list[0];

function account(s: AcctRow): MailAccount | string {
  const pass = unseal(s.smtpPasswordEnc, SECRET());
  if (!s.smtpHost || !s.smtpUser) return `Set the mail server and login of "${s.label || "this mailbox"}" first.`;
  if (!pass) return s.smtpPasswordEnc ? "The saved password can't be read (the server's secret changed). Enter it again in the mail settings." : `Enter the password of "${s.label || "this mailbox"}" in the mail settings first.`;
  const fromEmail = (s.fromEmail || s.smtpUser).trim();
  if (!isEmail(fromEmail)) return "The From address is not an email address.";
  return { smtpHost: s.smtpHost, smtpPort: s.smtpPort ?? 465, smtpSecure: s.smtpSecure, smtpUser: s.smtpUser, smtpPassword: pass, fromName: s.fromName, fromEmail, replyTo: s.replyTo, imapHost: s.imapHost, imapPort: s.imapPort, imapSecure: s.imapSecure, sentFolder: s.sentFolder, fileInSent: s.fileInSent };
}

async function recleanColumn(db: ScopedDb, key: string, type: string, options: unknown): Promise<void> {
  const rows = await db.outreachContact.findMany({ select: { id: true, data: true } });
  const ops = rows.flatMap((r) => {
    const d = { ...((r.data ?? {}) as Record<string, unknown>) }; if (!(key in d)) return [];
    const v = cleanCell(type, options, d[key]);
    if (v === null || (Array.isArray(v) && v.length === 0)) delete d[key]; else d[key] = v;
    return [db.outreachContact.update({ where: { id: r.id }, data: { data: d as object } })];
  });
  if (ops.length) await db.$transaction(ops);
}

/** place text and coordinates from a request body: lat/lng are kept only when they are real coordinates. */
function placeFields(b: { place?: unknown; lat?: unknown; lng?: unknown }, patch = false): { place?: string; lat?: number | null; lng?: number | null } {
  const out: { place?: string; lat?: number | null; lng?: number | null } = {};
  if (!patch || "place" in b) out.place = typeof b.place === "string" ? b.place.trim().slice(0, 160) : "";
  if (!patch || "lat" in b || "lng" in b) {
    const lat = b.lat === null || b.lat === "" ? NaN : Number(b.lat), lng = b.lng === null || b.lng === "" ? NaN : Number(b.lng);
    const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    out.lat = ok ? lat : null; out.lng = ok ? lng : null;
  }
  return out;
}

export async function outreachRoutes(app: FastifyInstance): Promise<void> {
  const W = { preHandler: workspaceAuth };
  await outreachWorkspaceRoutes(app, W);
  await outreachCollectRoutes(app, W);
  await outreachEmlRoutes(app, W);

  app.get("/api/outreach/state", W, async (req) => {
    const db = req.db; const ws = req.ox;
    const [accounts, columns, contacts, blockTypes, groups, templates, scheduled, newLeads] = await Promise.all([
      accountsOf(db),
      db.outreachColumn.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }),
      db.outreachContact.findMany({ orderBy: { id: "asc" }, include: WITH_GROUPS }),
      db.outreachBlockType.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], include: { blocks: { orderBy: [{ position: "asc" }, { id: "asc" }] } } }),
      db.outreachGroup.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
      db.outreachTemplate.findMany({ orderBy: { name: "asc" } }),
      db.outreachScheduled.findMany({ where: { OR: [{ status: { in: ["pending", "sending"] } }, { status: { in: ["failed", "sent"] }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } }] }, orderBy: { sendAt: "asc" }, take: 200 }),
      db.outreachLead.count({ where: { status: "new" } }),
    ]);
    const quietAfter = learn(statContacts(contacts), (await db.outreachSend.findMany({ where: { contactId: { not: null }, error: null }, select: { contactId: true, sentAt: true }, orderBy: { sentAt: "desc" }, take: 2000 })).map((x) => ({ contactId: x.contactId, templateName: null, blocksUsed: null, sentAt: x.sentAt })), groups).quietAfter;
    return {
      workspace: { id: ws.id, name: ws.name, slug: ws.slug, trackLinks: ws.trackLinks, dnc: ws.dnc, profile: ws.profile, attachRules: ws.attachRules, digestOn: ws.digestOn, trackAvailable: !!process.env.PUBLIC_URL },
      accounts: accounts.map(shapeAccount),
      columns: columns.map((c) => ({ id: c.id, key: c.key, name: c.name, type: c.type, options: (c.options as string[] | null) ?? [], hidden: c.hidden, width: c.width })),
      contacts: contacts.map(shapeContact),
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      templates: templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyMd: t.bodyMd, rules: t.rules })),
      scheduled: scheduled.map((q) => ({ id: q.id, to: q.toName ? `${q.toName} <${q.toEmail}>` : q.toEmail, contactId: q.contactId, subject: q.subject, sendAt: q.sendAt.toISOString(), status: q.status, error: q.error })),
      blockTypes: blockTypes.map((t) => ({ id: t.id, name: t.name, blocks: t.blocks.map((b) => ({ id: b.id, typeId: b.typeId, title: b.title, body: b.body })) })),
      newLeads,
      quietAfter: quietAfter,
      today: today(),
    };
  });

  app.get("/api/outreach/due", W, async (req) => {
    const db = req.db;
    const rows = await db.outreachContact.findMany({ where: { followUpAt: { lte: new Date(`${today()}T23:59:59Z`) } }, orderBy: { followUpAt: "asc" }, select: { id: true, name: true, email: true, followUpAt: true }, take: 50 });
    return { count: rows.length, contacts: rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name || r.email, followUpAt: ymd(r.followUpAt) })) };
  });

  // ---- mailboxes ("Send as X")
  const ACCOUNT_FIELDS = (b: Record<string, unknown>): { data: Record<string, unknown>; error?: string } => {
    const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const port = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null; };
    const data: Record<string, unknown> = {};
    if ("label" in b) data.label = str(b.label, 60) ?? "";
    if ("smtpHost" in b) data.smtpHost = str(b.smtpHost);
    if ("smtpPort" in b) data.smtpPort = port(b.smtpPort);
    if ("smtpSecure" in b) data.smtpSecure = b.smtpSecure !== false;
    if ("smtpUser" in b) data.smtpUser = str(b.smtpUser);
    if ("fromName" in b) data.fromName = str(b.fromName, 80);
    if ("fromEmail" in b) { const e = str(b.fromEmail); if (e && !isEmail(e.toLowerCase())) return { data, error: "The From address is not an email address." }; data.fromEmail = e; }
    if ("replyTo" in b) { const e = str(b.replyTo); if (e && !isEmail(e.toLowerCase())) return { data, error: "The Reply-To address is not an email address." }; data.replyTo = e; }
    for (const k of ["defaultCc", "defaultBcc"] as const) if (k in b) { const p = parseAddresses(b[k]); if (p.bad.length) return { data, error: `Not an email address: ${p.bad[0]}` }; data[k] = p.ok.join(", ") || null; }
    if ("imapHost" in b) data.imapHost = str(b.imapHost);
    if ("imapPort" in b) data.imapPort = port(b.imapPort);
    if ("imapSecure" in b) data.imapSecure = b.imapSecure !== false;
    if ("sentFolder" in b) data.sentFolder = str(b.sentFolder, 80) ?? "Sent";
    if ("fileInSent" in b) data.fileInSent = b.fileInSent === true;
    if ("inboxOn" in b) { data.inboxOn = b.inboxOn === true; if (b.inboxOn === true) { data.inboxError = null; } }
    if ("inboxFolder" in b) { data.inboxFolder = str(b.inboxFolder, 80) ?? "INBOX"; }
    if ("signatureMd" in b) data.signatureMd = typeof b.signatureMd === "string" ? b.signatureMd.slice(0, 5000) : "";
    if ("followUpDays" in b) { const n = Number(b.followUpDays); data.followUpDays = Number.isInteger(n) && n >= 1 && n <= 365 ? n : 14; }
    if (b.clearPassword === true) data.smtpPasswordEnc = null;
    else if (typeof b.password === "string" && b.password) { try { data.smtpPasswordEnc = seal(b.password, SECRET()); } catch (e) { return { data, error: e instanceof Error ? e.message : "couldn't protect the password" }; } }
    return { data };
  };
  app.post<{ Body: Record<string, unknown> }>("/api/outreach/accounts", { ...W, bodyLimit: 64 * 1024 }, async (req, reply) => {
    const db = req.db; const all = await accountsOf(db); if (all.length >= 12) return fail(reply, 409, "A workspace holds 12 mailboxes at most.");
    const r = ACCOUNT_FIELDS(req.body ?? {}); if (r.error) return fail(reply, 400, r.error);
    const a = await db.outreachAccount.create({ data: { label: "New mailbox", ...r.data, position: all.length, isDefault: false } as never });
    return reply.code(201).send(shapeAccount(a));
  });
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/outreach/accounts/:id", { ...W, bodyLimit: 64 * 1024 }, async (req, reply) => {
    const db = req.db; const id = Number(req.params.id) || 0; const cur = await db.outreachAccount.findUnique({ where: { id } }); if (!cur) return fail(reply, 404, "No such mailbox.");
    const r = ACCOUNT_FIELDS(req.body ?? {}); if (r.error) return fail(reply, 400, r.error);
    if (typeof r.data.inboxFolder === "string" && r.data.inboxFolder !== cur.inboxFolder) { r.data.inboxLastUid = 0; r.data.inboxValidity = null; } // another folder, another numbering
    if (req.body?.isDefault === true) { await db.outreachAccount.updateMany({ data: { isDefault: false } }); r.data.isDefault = true; }
    return shapeAccount(await db.outreachAccount.update({ where: { id }, data: r.data as never }));
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/accounts/:id", W, async (req, reply) => {
    const db = req.db; const all = await accountsOf(db); const id = Number(req.params.id) || 0;
    if (all.length <= 1) return fail(reply, 409, "A workspace keeps at least one mailbox.");
    if (!all.some((a) => a.id === id)) return fail(reply, 404, "No such mailbox.");
    await db.outreachAccount.delete({ where: { id } });
    if (all.find((a) => a.id === id)?.isDefault) await db.outreachAccount.update({ where: { id: all.find((a) => a.id !== id)!.id }, data: { isDefault: true } });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/outreach/accounts/:id/inbox-check", W, async (req, reply) => {
    const db = req.db; const a = await db.outreachAccount.findUnique({ where: { id: Number(req.params.id) || 0 } }); if (!a) return fail(reply, 404, "No such mailbox.");
    if (!a.imapHost) return fail(reply, 400, "Set the IMAP server of this mailbox first.");
    return checkInbox(a, account);
  });
  app.post<{ Params: { id: string } }>("/api/outreach/accounts/:id/test", W, async (req, reply) => {
    const db = req.db; const a = await db.outreachAccount.findUnique({ where: { id: Number(req.params.id) || 0 } }); if (!a) return fail(reply, 404, "No such mailbox.");
    const acc = account(a); if (typeof acc === "string") return fail(reply, 400, acc);
    return verifyAccount(acc);
  });

  // ---- columns
  app.post<{ Body: { name?: string; type?: string; options?: unknown } }>("/api/outreach/columns", W, async (req, reply) => { const db = req.db;
    const c = cleanColumnInput(req.body ?? {}); if (!c) return fail(reply, 400, "Give the column a name.");
    const all = await db.outreachColumn.findMany({ select: { key: true, position: true } });
    if (all.length >= MAX_COLUMNS) return fail(reply, 409, `A sheet holds ${MAX_COLUMNS} columns at most.`);
    const col = await db.outreachColumn.create({ data: { key: slugKey(c.name, all.map((x) => x.key)), name: c.name, type: c.type, options: c.options ?? undefined, position: Math.max(-1, ...all.map((x) => x.position)) + 1 } });
    return reply.code(201).send({ id: col.id, key: col.key, name: col.name, type: col.type, options: c.options ?? [], hidden: false, width: null });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; type?: string; options?: unknown; hidden?: boolean; width?: number | null } }>("/api/outreach/columns/:id", W, async (req, reply) => { const db = req.db;
    const id = Number(req.params.id) || 0; const cur = await db.outreachColumn.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such column.");
    const b = req.body ?? {};
    const c = cleanColumnInput({ name: b.name ?? cur.name, type: b.type ?? cur.type, options: "options" in b ? b.options : cur.options });
    if (!c) return fail(reply, 400, "Give the column a name.");
    const col = await db.outreachColumn.update({ where: { id }, data: { name: c.name, type: c.type, options: c.options ?? undefined, ...(typeof b.hidden === "boolean" ? { hidden: b.hidden } : {}), ...("width" in b ? { width: typeof b.width === "number" ? Math.max(60, Math.min(600, Math.round(b.width))) : null } : {}) } });
    if (c.type !== cur.type || JSON.stringify(c.options) !== JSON.stringify(cur.options ?? null)) await recleanColumn(db, cur.key, c.type, c.options);
    return { id: col.id, key: col.key, name: col.name, type: col.type, options: (col.options as string[] | null) ?? [], hidden: col.hidden, width: col.width };
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/columns/:id", W, async (req, reply) => { const db = req.db;
    const id = Number(req.params.id) || 0; const cur = await db.outreachColumn.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such column.");
    await db.outreachColumn.delete({ where: { id } });
    const rows = await db.outreachContact.findMany({ select: { id: true, data: true } });
    const ops = rows.flatMap((r) => { const d = { ...((r.data ?? {}) as Record<string, unknown>) }; if (!(cur.key in d)) return []; delete d[cur.key]; return [db.outreachContact.update({ where: { id: r.id }, data: { data: d as object } })]; });
    if (ops.length) await db.$transaction(ops);
    return { ok: true };
  });
  app.put<{ Body: { ids?: number[] } }>("/api/outreach/columns/order", W, async (req, reply) => { const db = req.db;
    const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list of column ids.");
    await db.$transaction(ids.map((id, position) => db.outreachColumn.update({ where: { id }, data: { position } })));
    return { ok: true };
  });

  // ---- contacts
  app.post<{ Body: { name?: string; email?: string; status?: string; deadline?: string; followUpAt?: string; place?: string; lat?: number; lng?: number; source?: string; groups?: number[]; fill?: { name: string; type?: string; value: unknown }[] } }>("/api/outreach/contacts", W, async (req, reply) => { const db = req.db;
    const b = req.body ?? {}; const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const data: Record<string, unknown> = {};
    if (Array.isArray(b.fill) && b.fill.length) {
      const cols = await db.outreachColumn.findMany(); const keys = await ensureColumns(db, b.fill.filter((f) => f && typeof f.name === "string" && f.value !== undefined && f.value !== "").slice(0, 12).map((f) => ({ name: f.name, type: f.type ?? "text" })));
      for (const f of b.fill) { const key = keys.get(f.name); if (!key) continue; const col = (await db.outreachColumn.findFirst({ where: { key } })) ?? cols.find((c) => c.key === key); const x = col ? cleanCell(col.type, col.options, f.value) : null; if (x !== null && x !== "") data[key] = x; }
    }
    const dl = dateOnly(b.deadline ?? undefined), fu = dateOnly(b.followUpAt ?? undefined);
    const real = Array.isArray(b.groups) && b.groups.length ? await db.outreachGroup.findMany({ where: { id: { in: b.groups.filter(Number.isInteger) } }, select: { id: true } }) : [];
    const geo = placeFields(b);
    const c = await db.outreachContact.create({ data: { ...geo, source: typeof b.source === "string" ? b.source.slice(0, 20) : null, name: typeof b.name === "string" ? b.name.trim().slice(0, 120) : "", email: isEmail(email) ? email : "", data: data as object, status: cleanStatus(b.status), deadline: dl ? new Date(`${dl}T00:00:00Z`) : null, followUpAt: fu ? new Date(`${fu}T00:00:00Z`) : null, groups: { connect: real } }, include: WITH_GROUPS });
    return reply.code(201).send(shapeContact(c));
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; email?: string; set?: Record<string, unknown>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null; groups?: number[]; status?: string; deadline?: string | null; timezone?: string; replied?: boolean; place?: string; lat?: number | null; lng?: number | null; doNotContact?: boolean; snoozeReason?: string; declineReason?: string; reopensAt?: string | null } }>("/api/outreach/contacts/:id", W, async (req, reply) => { const db = req.db;
    const id = Number(req.params.id) || 0; const cur = await db.outreachContact.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such contact.");
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if ("name" in b) data.name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
    if ("email" in b) { const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""; if (e && !isEmail(e)) return fail(reply, 400, "That is not an email address."); data.email = e; }
    if ("lastSentAt" in b) data.lastSentAt = b.lastSentAt ? (dateOnly(b.lastSentAt) ? new Date(`${dateOnly(b.lastSentAt)}T00:00:00Z`) : null) : null;
    if ("followUpAt" in b) { data.followUpAt = b.followUpAt ? (dateOnly(b.followUpAt) ? new Date(`${dateOnly(b.followUpAt)}T00:00:00Z`) : null) : null; if (!b.followUpAt || !("snoozeReason" in b)) data.snoozeReason = null; }
    if ("deadline" in b) data.deadline = b.deadline ? (dateOnly(b.deadline) ? new Date(`${dateOnly(b.deadline)}T00:00:00Z`) : null) : null;
    if ("timezone" in b) data.timezone = validZone(b.timezone) ? b.timezone : null;
    if ("place" in b || "lat" in b || "lng" in b) Object.assign(data, placeFields(b, true));
    if ("doNotContact" in b) data.doNotContact = b.doNotContact === true;
    if ("snoozeReason" in b) data.snoozeReason = typeof b.snoozeReason === "string" && b.snoozeReason.trim() ? b.snoozeReason.trim().slice(0, 120) : null;
    if ("declineReason" in b) data.declineReason = typeof b.declineReason === "string" && b.declineReason.trim() ? b.declineReason.trim().slice(0, 160) : null;
    if ("reopensAt" in b) data.reopensAt = b.reopensAt ? (dateOnly(b.reopensAt) ? new Date(`${dateOnly(b.reopensAt)}T00:00:00Z`) : null) : null;
    if ("status" in b) {
      const st = cleanStatus(b.status); data.status = st;
      if (endsWaiting(st)) { data.followUpAt = null; data.snoozeReason = null; } // an answer ends the waiting
      if (st === "replied" && !cur.repliedAt) data.repliedAt = new Date(`${today()}T00:00:00Z`);
      if ((st === "" || st === "lead" || st === "contacted") && cur.repliedAt) data.repliedAt = null;
    }
    if ("sentCount" in b) { const n = Math.round(Number(b.sentCount)); data.sentCount = Number.isFinite(n) ? Math.max(0, Math.min(9999, n)) : 0; }
    if (b.set && typeof b.set === "object") {
      const cols = await db.outreachColumn.findMany(); const d = { ...((cur.data ?? {}) as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b.set)) {
        const col = cols.find((x) => x.key === k); if (!col) continue;
        const x = cleanCell(col.type, col.options, v);
        if (x === null || x === "" || (Array.isArray(x) && x.length === 0) || x === false) delete d[k]; else d[k] = x;
      }
      data.data = d;
    }
    if (Array.isArray(b.groups)) {
      const ids = b.groups.filter(Number.isInteger); const real = ids.length ? await db.outreachGroup.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
      data.groups = { set: real };
    }
    return shapeContact(await db.outreachContact.update({ where: { id }, data, include: WITH_GROUPS }));
  });
  app.post<{ Body: { ids?: number[] } }>("/api/outreach/contacts/delete", W, async (req, reply) => { const db = req.db;
    const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list of contact ids.");
    const r = await db.outreachContact.deleteMany({ where: { id: { in: ids } } });
    return { deleted: r.count };
  });
  app.post<{ Body: { csv?: string; hints?: Record<string, string> } }>("/api/outreach/contacts/import", { ...W, bodyLimit: 3 * 1024 * 1024 }, async (req, reply) => { const db = req.db;
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) return fail(reply, 400, "Paste or choose a CSV first.");
    const first = csv.split(/\r?\n/, 1)[0]; const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((x, y) => y[1] - x[1])[0][0];
    let rows: string[][]; try { rows = parse(csv, { delimiter, relax_column_count: true, skip_empty_lines: true, bom: true, relax_quotes: true }) as string[][]; } catch { return fail(reply, 400, "That doesn't read as a CSV."); }
    if (rows.length < 2) return fail(reply, 400, "The first row must be the column names, followed by contacts.");
    const cols = await db.outreachColumn.findMany({ orderBy: { position: "asc" } });
    const hints: Record<string, string> = {}; for (const [k, v] of Object.entries((req.body as { hints?: Record<string, string> }).hints ?? {})) hints[k.trim().toLowerCase().replace(/[\s_-]+/g, " ")] = String(v);
    const plan = planImport(rows[0], rows.slice(1), cols as unknown as ColumnDef[], 2000, hints);
    const before = plan.contacts.length; plan.contacts = plan.contacts.filter((c) => !c.email || !dncHit(req.ox.dnc, c.email)); const blocked = before - plan.contacts.length;
    let pos = Math.max(-1, ...cols.map((c) => c.position)) + 1;
    for (const c of plan.newColumns) await db.outreachColumn.create({ data: { key: c.key, name: c.name, type: c.type, position: pos++ } });
    const names = [...new Set(plan.contacts.flatMap((c) => c.groups))];
    const have = new Map((await db.outreachGroup.findMany()).map((g) => [g.name.toLowerCase(), g.id]));
    for (const n of names) if (!have.has(n.toLowerCase())) { const g = await db.outreachGroup.create({ data: { name: n, position: have.size } }).catch(() => null); if (g) have.set(n.toLowerCase(), g.id); }
    const rowOf = (c: (typeof plan.contacts)[number]) => ({ name: c.name, email: c.email, data: c.data as object, lastSentAt: c.lastSentAt ? new Date(`${c.lastSentAt}T00:00:00Z`) : null, sentCount: c.sentCount, followUpAt: c.followUpAt ? new Date(`${c.followUpAt}T00:00:00Z`) : null, status: c.status, deadline: c.deadline ? new Date(`${c.deadline}T00:00:00Z`) : null, timezone: c.timezone, place: c.place, lat: c.lat, lng: c.lng, source: "import" });
    if (names.length === 0) await db.outreachContact.createMany({ data: plan.contacts.map(rowOf) });
    else await db.$transaction(plan.contacts.map((c) => db.outreachContact.create({ data: { ...rowOf(c), groups: { connect: c.groups.flatMap((n) => (have.has(n.toLowerCase()) ? [{ id: have.get(n.toLowerCase()) as number }] : [])) } } })));
    return { added: plan.contacts.length, skipped: plan.skipped, blocked, newColumns: plan.newColumns.map((c) => c.name), newGroups: names };
  });

  // ---- groups
  app.post<{ Body: { name?: string } }>("/api/outreach/groups", W, async (req, reply) => { const db = req.db;
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the group.");
    const all = await db.outreachGroup.findMany({ select: { name: true } });
    if (all.some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail(reply, 409, "There is already a group with that name.");
    const g = await db.outreachGroup.create({ data: { name, position: all.length } });
    return reply.code(201).send({ id: g.id, name: g.name });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/outreach/groups/:id", W, async (req, reply) => { const db = req.db;
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the group.");
    const id = Number(req.params.id) || 0;
    const clash = await db.outreachGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id } } });
    if (clash) return fail(reply, 409, "There is already a group with that name.");
    const g = await db.outreachGroup.update({ where: { id }, data: { name } }).catch(() => null);
    return g ? { id: g.id, name: g.name } : fail(reply, 404, "No such group.");
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/groups/:id", W, async (req) => { const db = req.db; await db.outreachGroup.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });
  app.post<{ Params: { id: string }; Body: { add?: number[]; remove?: number[] } }>("/api/outreach/groups/:id/members", W, async (req, reply) => { const db = req.db;
    const id = Number(req.params.id) || 0; const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter(Number.isInteger).slice(0, 2000) : []);
    const add = ints(req.body?.add), remove = ints(req.body?.remove);
    if (!(await db.outreachGroup.findUnique({ where: { id } }))) return fail(reply, 404, "No such group.");
    const mine = new Set((await db.outreachContact.findMany({ where: { id: { in: [...add, ...remove] } }, select: { id: true } })).map((c) => c.id));
    await db.outreachGroup.update({ where: { id }, data: { contacts: { connect: add.filter((x) => mine.has(x)).map((x) => ({ id: x })), disconnect: remove.filter((x) => mine.has(x)).map((x) => ({ id: x })) } } }).catch(() => null);
    return { ok: true };
  });

  // ---- blocks of text
  app.post<{ Body: { name?: string } }>("/api/outreach/block-types", W, async (req, reply) => { const db = req.db;
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the kind of block.");
    const last = await db.outreachBlockType.findFirst({ orderBy: { position: "desc" } });
    const t = await db.outreachBlockType.create({ data: { name, position: (last?.position ?? -1) + 1 } });
    return reply.code(201).send({ id: t.id, name: t.name, blocks: [] });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/outreach/block-types/:id", W, async (req, reply) => { const db = req.db;
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the kind of block.");
    const t = await db.outreachBlockType.update({ where: { id: Number(req.params.id) || 0 }, data: { name } }).catch(() => null);
    return t ? { id: t.id, name: t.name } : fail(reply, 404, "No such kind of block.");
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/block-types/:id", W, async (req) => { const db = req.db; await db.outreachBlockType.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });
  app.post<{ Body: { typeId?: number; title?: string; body?: string } }>("/api/outreach/blocks", { ...W, bodyLimit: 256 * 1024 }, async (req, reply) => { const db = req.db;
    const b = req.body ?? {}; const title = (b.title ?? "").trim().slice(0, 80);
    if (!title || !Number.isInteger(b.typeId)) return fail(reply, 400, "A block needs a kind and a title.");
    const type = await db.outreachBlockType.findUnique({ where: { id: b.typeId as number } }); if (!type) return fail(reply, 404, "No such kind of block.");
    const last = await db.outreachBlock.findFirst({ where: { typeId: type.id }, orderBy: { position: "desc" } });
    const blk = await db.outreachBlock.create({ data: { typeId: type.id, title, body: (b.body ?? "").slice(0, 20000), position: (last?.position ?? -1) + 1 } });
    return reply.code(201).send({ id: blk.id, typeId: blk.typeId, title: blk.title, body: blk.body });
  });
  app.patch<{ Params: { id: string }; Body: { typeId?: number; title?: string; body?: string } }>("/api/outreach/blocks/:id", { ...W, bodyLimit: 256 * 1024 }, async (req, reply) => { const db = req.db;
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if (typeof b.title === "string") { const t = b.title.trim().slice(0, 80); if (!t) return fail(reply, 400, "A block needs a title."); data.title = t; }
    if (typeof b.body === "string") data.body = b.body.slice(0, 20000);
    if (Number.isInteger(b.typeId)) { if (!(await db.outreachBlockType.findUnique({ where: { id: b.typeId as number } }))) return fail(reply, 404, "No such kind of block."); data.typeId = b.typeId; }
    const blk = await db.outreachBlock.update({ where: { id: Number(req.params.id) || 0 }, data }).catch(() => null);
    return blk ? { id: blk.id, typeId: blk.typeId, title: blk.title, body: blk.body } : fail(reply, 404, "No such block.");
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/blocks/:id", W, async (req) => { const db = req.db; await db.outreachBlock.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });

  // ---- files that go into a message (pictures show in the body; audio and other files are attached). Every upload joins the library.
  const kindOf = (mime: string): string => (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "file");
  const shapeFile = (f: { id: number; groupId: number | null; name: string; url: string; mimeType: string; sizeBytes: number; createdAt: Date }) => ({ id: f.id, groupId: f.groupId, name: f.name, url: f.url, mimeType: f.mimeType, sizeBytes: f.sizeBytes, kind: kindOf(f.mimeType), createdAt: f.createdAt.toISOString().slice(0, 10) });
  app.post<{ Querystring: { group?: string } }>("/api/outreach/files", W, async (req, reply) => {
    const db = req.db; const file = await req.file(); if (!file) return fail(reply, 400, "No file uploaded.");
    const ext = path.extname(file.filename).toLowerCase();
    if (!FILE_EXT.has(ext)) return fail(reply, 400, `Files of type "${ext || "unknown"}" can't be attached (pictures, audio, PDF, zip, text and documents can).`);
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_ATTACH_BYTES) return fail(reply, 413, "That file is over 20 MB: mail providers would refuse the message.");
    const hash = createHash("sha1").update(buffer).digest("hex");
    const same = await db.outreachFile.findFirst({ where: { hash } });
    if (same) return reply.code(200).send({ url: same.url, filename: same.name, mimeType: same.mimeType, sizeBytes: same.sizeBytes, id: same.id, reused: true });
    const safe = path.basename(file.filename, ext).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
    const dir = path.join(UPLOADS_DIR, "outreach"); await mkdir(dir, { recursive: true });
    const disk = `${randomBytes(4).toString("hex")}-${safe}${ext}`;
    await writeFile(path.join(dir, disk), buffer);
    const gid = Number(req.query.group) || null; const grp = gid ? await db.outreachFileGroup.findUnique({ where: { id: gid } }) : null;
    const rec = await db.outreachFile.create({ data: { name: `${safe}${ext}`, url: `/uploads/outreach/${disk}`, mimeType: file.mimetype, sizeBytes: buffer.length, hash, groupId: grp?.id ?? null } });
    return reply.code(201).send({ url: rec.url, filename: rec.name, mimeType: rec.mimeType, sizeBytes: rec.sizeBytes, id: rec.id });
  });
  app.get("/api/outreach/files", W, async (req) => {
    const db = req.db; const [files, groups] = await Promise.all([db.outreachFile.findMany({ orderBy: { id: "desc" }, take: 500 }), db.outreachFileGroup.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] })]);
    return { files: files.map(shapeFile), groups: groups.map((g) => ({ id: g.id, name: g.name })) };
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; groupId?: number | null } }>("/api/outreach/files/:id", W, async (req, reply) => {
    const db = req.db; const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 100);
    if ("groupId" in b) { if (b.groupId === null) data.groupId = null; else if (Number.isInteger(b.groupId) && (await db.outreachFileGroup.findUnique({ where: { id: b.groupId as number } }))) data.groupId = b.groupId; }
    const f = await db.outreachFile.update({ where: { id: Number(req.params.id) || 0 }, data }).catch(() => null);
    return f ? shapeFile(f) : fail(reply, 404, "No such file.");
  });
  app.post<{ Body: { ids?: number[]; groupId?: number | null } }>("/api/outreach/files/move", W, async (req, reply) => {
    const db = req.db; const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list of file ids.");
    const gid = req.body?.groupId ?? null; if (gid !== null && !(await db.outreachFileGroup.findUnique({ where: { id: gid } }))) return fail(reply, 404, "No such file group.");
    const r = await db.outreachFile.updateMany({ where: { id: { in: ids } }, data: { groupId: gid } }); return { moved: r.count };
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/files/:id", W, async (req) => { const db = req.db; await db.outreachFile.deleteMany({ where: { id: Number(req.params.id) || 0 } }); return { ok: true }; }); // the disk copy stays: sent mail may still point at it
  app.post<{ Body: { name?: string } }>("/api/outreach/file-groups", W, async (req, reply) => {
    const db = req.db; const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the group.");
    const all = await db.outreachFileGroup.findMany(); if (all.some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail(reply, 409, "There is already a group with that name.");
    const g = await db.outreachFileGroup.create({ data: { name, position: all.length } }); return reply.code(201).send({ id: g.id, name: g.name });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/outreach/file-groups/:id", W, async (req, reply) => {
    const db = req.db; const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the group.");
    const g = await db.outreachFileGroup.update({ where: { id: Number(req.params.id) || 0 }, data: { name } }).catch(() => null); return g ? { id: g.id, name: g.name } : fail(reply, 404, "No such group.");
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/file-groups/:id", W, async (req) => {
    const db = req.db; const id = Number(req.params.id) || 0; await db.outreachFile.updateMany({ where: { groupId: id }, data: { groupId: null } }); await db.outreachFileGroup.deleteMany({ where: { id } }); return { ok: true };
  });

  // ---- preview and send
  type Rule = VariantRule;
  type ComposeBody = {
    subject?: string; subjectB?: string; accountId?: number; bodyMd?: string; contactId?: number | null; contactIds?: number[]; extraTo?: string; cc?: string; bcc?: string; followUpAt?: string | null; test?: boolean; signature?: boolean; fileInSent?: boolean; allowMissing?: boolean;
    rules?: Rule[]; templateName?: string | null; threadFollowUp?: boolean; plainOnly?: boolean;
    sendAt?: { date?: string; time?: string; recipientZone?: boolean; weekdays?: boolean; zone?: string } | null;
  };
  const withSignature = (md: string, s: { signatureMd: string }, on: boolean | undefined): string => (on !== false && s.signatureMd.trim() ? `${md.trimEnd()}\n\n${s.signatureMd.trim()}` : md);
  const sizeOf = (url: string): number | null => { const f = uploadFile(url, UPLOADS_DIR); try { return f ? statSync(f).size : null; } catch { return null; } };
  const cleanRules = (v: unknown): Rule[] => (Array.isArray(v) ? v.flatMap((r) => (r && typeof r.kind === "string" && Number.isInteger(r.blockId) && (r.group === null || Number.isInteger(r.group)) ? [{ kind: r.kind.slice(0, 60), group: r.group as number | null, blockId: r.blockId as number }] : [])).slice(0, 200) : []);
  const allBlocks = async (db: ScopedDb): Promise<BlockRef[]> => (await db.outreachBlock.findMany({ include: { type: true }, orderBy: { id: "asc" } })).map((b) => ({ id: b.id, kind: b.type.name, title: b.title, body: b.body }));
  type AttachRule = { group: number; fileId: number };
  const mediaMd = (f: { url: string; name: string; mimeType: string }): string => { const label = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim(); return f.mimeType.startsWith("image/") ? `![${label}](${f.url})` : f.mimeType.startsWith("audio/") ? `@audio(${f.url})[${label}]` : `@file(${f.url})[${label}]`; };
  /** Files that go with everyone in a group, added under the message. */
  const attachLines = async (db: ScopedDb, ws: { attachRules: unknown }, groups: number[]): Promise<string> => {
    const rules = (Array.isArray(ws.attachRules) ? ws.attachRules : []) as AttachRule[]; const ids = [...new Set(rules.filter((r) => groups.includes(r.group)).map((r) => r.fileId))]; if (!ids.length) return "";
    const files = await db.outreachFile.findMany({ where: { id: { in: ids } } }); return files.map(mediaMd).join("\n\n");
  };

  type Who = { name: string; email: string; data: Record<string, unknown>; lastSentAt: Date | null; sentCount: number; groups: number[] };
  async function renderFor(db: ScopedDb, ws: { attachRules: unknown }, s: { signatureMd: string }, columns: ColumnDef[], blocks: BlockRef[], b: ComposeBody, who: Who, mark = false, subjectOverride?: string) {
    const vals = fieldValues(who, columns);
    const extra = await attachLines(db, ws, who.groups);
    const lang = String(who.data.language ?? who.data.langue ?? "");
    const ex = expandBlocks(withSignature(`${(b.bodyMd ?? "").trimEnd()}${extra ? `\n\n${extra}` : ""}`, s, b.signature), cleanRules(b.rules), blocks, who.groups, lang);
    const body = fillFields(ex.text, vals, mark), subject = fillFields(subjectOverride ?? b.subject ?? "", vals);
    const rendered = renderMail(body.text, { sizeOf });
    if (mark) rendered.html = highlightMarks(rendered.html); else rendered.html = stripMarks(rendered.html);
    rendered.text = stripMarks(rendered.text);
    return { rendered, subject: subject.text, missing: [...new Set([...body.missing, ...subject.missing])], used: ex.used, unresolved: ex.unresolved };
  }
  function checkFiles(rendered: ReturnType<typeof renderMail>): { files: { filename: string; path: string; cid?: string; size: number }[]; error: string | null } {
    const files: { filename: string; path: string; cid?: string; size: number }[] = []; let total = 0;
    for (const a of rendered.attachments) {
      const p = uploadFile(a.url, UPLOADS_DIR); let size = 0;
      try { size = p ? statSync(p).size : -1; } catch { size = -1; }
      if (!p || size < 0) return { files, error: `A file in the message is missing from the server: ${a.filename}` };
      total += size; files.push({ filename: a.filename, path: p, cid: a.cid, size });
    }
    return { files, error: total > MAX_ATTACH_BYTES ? `The message carries ${(total / 1024 / 1024).toFixed(1)} MB of files; most providers stop at 25 MB, so the limit here is 20 MB.` : null };
  }
  const whoOf = (c: { name: string; email: string; data: unknown; lastSentAt: Date | null; sentCount: number; groups: { id: number }[] }): Who => ({ name: c.name, email: c.email, data: (c.data ?? {}) as Record<string, unknown>, lastSentAt: c.lastSentAt, sentCount: c.sentCount, groups: c.groups.map((g) => g.id) });
  /** Subject B goes to every second person: the same order every time, so a batch splits evenly. */
  const variantFor = (b: ComposeBody, i: number): { subject: string; variant: "A" | "B" | null } => (b.subjectB?.trim() && i % 2 === 1 ? { subject: b.subjectB, variant: "B" } : { subject: b.subject ?? "", variant: b.subjectB?.trim() ? "A" : null });

  app.post<{ Body: ComposeBody }>("/api/outreach/preview", { ...W, bodyLimit: 512 * 1024 }, async (req) => {
    const db = req.db; const b = req.body ?? {}; const [accts, cols, blocks] = await Promise.all([accountsOf(db), db.outreachColumn.findMany({ orderBy: { position: "asc" } }), allBlocks(db)]);
    const s = pickAccount(accts, b.accountId);
    const contact = Number.isInteger(b.contactId) ? await db.outreachContact.findUnique({ where: { id: b.contactId as number }, include: WITH_GROUPS }) : null;
    const who: Who = contact ? whoOf(contact) : { name: "Alex Example", email: "alex@example.org", data: {}, lastSentAt: null, sentCount: 0, groups: [] };
    const r = await renderFor(db, req.ox, s, cols as unknown as ColumnDef[], blocks, b, who, true);
    const chk = checkFiles(r.rendered);
    return { html: r.rendered.html, text: r.rendered.text, subject: r.subject, missing: contact ? r.missing : [], warnings: [...r.rendered.warnings, ...r.unresolved.map((k) => `No block of the kind "${k}" exists yet.`), ...(chk.error ? [chk.error] : [])], attachments: r.rendered.attachments.map((a) => ({ filename: a.filename, kind: a.kind, size: sizeOf(a.url) })), sampleContact: !contact, used: r.used };
  });

  // Everyone the message would go to, rendered: so a wrong name or an empty field shows before anything leaves.
  app.post<{ Body: ComposeBody }>("/api/outreach/review", { ...W, bodyLimit: 512 * 1024 }, async (req) => {
    const db = req.db; const b = req.body ?? {}; const ids = Array.isArray(b.contactIds) ? b.contactIds.filter(Number.isInteger).slice(0, MAX_RECIPIENTS) : [];
    const [accts, cols, blocks, rows, groups] = await Promise.all([accountsOf(db), db.outreachColumn.findMany({ orderBy: { position: "asc" } }), allBlocks(db), db.outreachContact.findMany({ where: { id: { in: ids } }, include: WITH_GROUPS, orderBy: { id: "asc" } }), db.outreachGroup.findMany()]);
    const s = pickAccount(accts, b.accountId); const rightsCol = cols.find((c) => c.key === "rights_checked" && c.type === "checkbox");
    return Promise.all(rows.map(async (c, i) => {
      const v = variantFor(b, i);
      const r = await renderFor(db, req.ox, s, cols as unknown as ColumnDef[], blocks, b, whoOf(c), false, v.subject);
      const lines = r.rendered.text.split("\n").map((l) => l.trim()).filter(Boolean);
      const idle = quietDays(ymd(c.lastSentAt), today());
      const notes: string[] = [];
      if (dncHit(req.ox.dnc, c.email) || c.doNotContact) notes.push("On the do-not-contact list: will be skipped");
      if (idle !== null && idle < 14) notes.push(`Written to ${idle === 0 ? "today" : `${idle} day${idle === 1 ? "" : "s"} ago`}`);
      if (rightsCol && !(c.data as Record<string, unknown>)?.rights_checked) notes.push("Rights / format not checked");
      return { id: c.id, to: c.name || c.email, email: c.email, subject: r.subject, variant: v.variant, greeting: (lines[0] ?? "").slice(0, 140), missing: r.missing, hasEmail: isEmail(c.email), groups: c.groups.map((g) => groups.find((x) => x.id === g.id)?.name).filter(Boolean), used: r.used.map((u) => u.blockId), notes };
    }));
  });

  type Target = { contactId: number | null; name: string; email: string; who: Who; status: string; timezone: string | null };
  type Sent = { code: number; body: Record<string, unknown> };
  const E = (code: number, error: string, extra: object = {}): Sent => ({ code, body: { error, ...extra } });

  async function runSend(db: ScopedDb, workspaceId: number, b: ComposeBody, opts: { scheduler?: boolean } = {}): Promise<Sent> {
    const ws = await prisma.outreachWorkspace.findUnique({ where: { id: workspaceId } }); if (!ws) return E(404, "The workspace is gone.");
    const accts = await accountsOf(db); const s = pickAccount(accts, b.accountId); const acct = account(s); if (typeof acct === "string") return E(400, acct);
    const subjectRaw = (b.subject ?? "").trim(); if (!subjectRaw) return E(400, "Write a subject.");
    if (!(b.bodyMd ?? "").trim()) return E(400, "The message is empty.");
    const cc = parseAddresses(b.cc), bcc = parseAddresses(b.bcc);
    if (cc.bad.length || bcc.bad.length) return E(400, `Not an email address: ${[...cc.bad, ...bcc.bad][0]}`);
    const cols = (await db.outreachColumn.findMany({ orderBy: { position: "asc" } })) as unknown as ColumnDef[]; const blocks = await allBlocks(db);

    const targets: Target[] = []; const skipped: string[] = [];
    const nobody: Who = { name: "", email: "", data: {}, lastSentAt: null, sentCount: 0, groups: [] };
    if (b.test) targets.push({ contactId: null, name: "", email: acct.fromEmail, who: { ...nobody, email: acct.fromEmail }, status: "", timezone: null });
    else {
      const ids = Array.isArray(b.contactIds) ? b.contactIds.filter(Number.isInteger) : [];
      const rows = ids.length ? await db.outreachContact.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, include: WITH_GROUPS }) : [];
      for (const c of rows) {
        if (!isEmail(c.email)) { skipped.push(c.name || `#${c.id}`); continue; }
        if (c.doNotContact || dncHit(ws.dnc, c.email)) { skipped.push(`${c.name || c.email} (do not contact)`); continue; }
        targets.push({ contactId: c.id, name: c.name, email: c.email, who: whoOf(c), status: c.status, timezone: c.timezone });
      }
      const extra = parseAddresses(b.extraTo); if (extra.bad.length) return E(400, `Not an email address: ${extra.bad[0]}`);
      for (const e of extra.ok) { if (dncHit(ws.dnc, e)) { skipped.push(`${e} (do not contact)`); continue; } if (!targets.some((t) => t.email === e)) targets.push({ contactId: null, name: "", email: e, who: { ...nobody, email: e }, status: "", timezone: null }); }
    }
    if (targets.length === 0) return E(400, skipped.length ? `Nobody to write to: ${skipped.slice(0, 3).join(", ")}.` : "Choose who to write to.");
    if (targets.length > MAX_RECIPIENTS) return E(400, `At most ${MAX_RECIPIENTS} people per send.`);

    // Everything is checked before the first message leaves: missing fields, missing blocks and files, size.
    const prepared: { t: Target; subject: string; variant: "A" | "B" | null; rendered: ReturnType<typeof renderMail>; files: ReturnType<typeof checkFiles>["files"]; used: { kind: string; blockId: number }[] }[] = [];
    const holes: { to: string; fields: string[] }[] = [];
    const rightsCol = cols.find((c) => c.key === "rights_checked" && c.type === "checkbox");
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]; const v = variantFor(b, i);
      const r = await renderFor(db, ws, s, cols, blocks, b, t.who, false, v.subject);
      if (r.unresolved.length) return E(400, `No block of the kind "${r.unresolved[0]}" exists: make one or remove {{block:${r.unresolved[0]}}}.`);
      const miss = [...r.missing]; if (rightsCol && t.contactId && !t.who.data.rights_checked) miss.push("rights checked");
      if (miss.length) holes.push({ to: t.name || t.email, fields: miss });
      const chk = checkFiles(r.rendered); if (chk.error) return E(400, chk.error);
      if (!r.subject.trim()) return E(400, "The subject came out empty.");
      prepared.push({ t, subject: r.subject.trim().slice(0, 200), variant: v.variant, rendered: r.rendered, files: chk.files, used: r.used });
    }
    if (holes.length && !b.allowMissing) return E(409, "Some fields are empty for some contacts.", { missing: holes });
    const followUp = dateOnly(b.followUpAt ?? undefined);

    // Send later: one queued message per person, each at its own hour when "their time" is on.
    if (b.sendAt && !b.test && !opts.scheduler) {
      const date = dateOnly(b.sendAt.date ?? undefined), time = /^\d\d:\d\d$/.test(b.sendAt.time ?? "") ? (b.sendAt.time as string) : "10:00";
      if (!date) return E(400, "Choose the day to send.");
      const myZone = validZone(b.sendAt.zone) ? b.sendAt.zone : process.env.OUTREACH_TZ && validZone(process.env.OUTREACH_TZ) ? process.env.OUTREACH_TZ : "UTC"; // the browser says where you are
      const rows = prepared.map((p) => {
        const tz = b.sendAt?.recipientZone && validZone(p.t.timezone) ? (p.t.timezone as string) : myZone;
        const day = b.sendAt?.weekdays ? nextWeekday(date) : date;
        return { p, at: zonedToUtc(day, time, tz) };
      });
      if (rows.some((r) => !r.at)) return E(400, "That time doesn't exist.");
      if (rows.every((r) => (r.at as Date).getTime() < Date.now() - 60_000)) return E(400, "That time is in the past.");
      const { sendAt: _drop, contactIds: _c, extraTo: _e, subjectB: _sb, ...rest } = b;
      await db.outreachScheduled.createMany({ data: rows.map(({ p, at }) => ({ contactId: p.t.contactId, toEmail: p.t.email, toName: p.t.name, subject: p.subject, sendAt: at as Date, payload: { ...rest, subject: p.subject, accountId: s.id, allowMissing: true, variant: p.variant, ...(p.t.contactId ? { contactIds: [p.t.contactId] } : { extraTo: p.t.email }) } as object })) });
      return { code: 200, body: { scheduled: rows.length, firstAt: (rows.map((r) => r.at as Date).sort((x, y) => x.getTime() - y.getTime())[0]).toISOString(), skipped } };
    }

    const batch = randomBytes(5).toString("hex");
    const base = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";
    const results: { to: string; ok: boolean; error?: string; filedInSent?: boolean }[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const { t, subject, rendered, files, used } = prepared[i];
      const variant = prepared[i].variant ?? ((b as { variant?: "A" | "B" | null }).variant ?? null);
      const messageId = messageIdFor(acct.fromEmail);
      const keep = b.plainOnly ? files.filter((f) => !f.cid) : files; // a text-only mail has no place for inline pictures
      let inReplyTo: string | undefined;
      if (b.threadFollowUp && t.contactId) inReplyTo = (await db.outreachSend.findFirst({ where: { contactId: t.contactId, messageId: { not: null }, error: null }, orderBy: { sentAt: "desc" }, select: { messageId: true } }))?.messageId ?? undefined;
      let html = b.plainOnly ? "" : rendered.html;
      if (html && ws.trackLinks && base && !b.test) {
        const made = new Map<string, string>();
        html = linkifyForTracking(html, (url) => { if (made.has(url) || url.startsWith(base)) return made.get(url) ?? null; const code = randomBytes(5).toString("hex"); made.set(url, `${base}/o/${code}`); return made.get(url) as string; });
        if (made.size) await db.outreachLink.createMany({ data: [...made].map(([url, u]) => ({ code: u.slice(u.lastIndexOf("/") + 1), url, contactId: t.contactId })) });
      }
      const common = { from: acct, to: { email: t.email, name: t.name }, cc: cc.ok, bcc: bcc.ok, subject, text: rendered.text, html, attachments: keep, messageId, inReplyTo, references: inReplyTo };
      try {
        const raw = await buildRaw(common);
        await deliver(acct, raw, [t.email, ...cc.ok, ...bcc.ok]);
        let filed = false, filedError: string | null = null;
        if ((b.fileInSent ?? acct.fileInSent) && acct.imapHost) { filedError = await fileCopyInSent(acct, await buildRaw({ ...common, keepBcc: true })); filed = filedError === null; }
        if (!b.test) {
          await db.outreachSend.create({ data: { accountId: s.id, subjectVariant: variant, contactId: t.contactId, toEmail: t.email, toName: t.name, subject, bodyMd: b.bodyMd ?? "", cc: cc.ok.join(", ") || null, bcc: bcc.ok.join(", ") || null, messageId, filedInSent: filed, error: filedError ? `Sent, but not filed in Sent: ${filedError}` : null, batch, templateName: b.templateName?.slice(0, 80) || null, blocksUsed: used as object } });
          if (t.contactId) await db.outreachContact.update({ where: { id: t.contactId }, data: { lastSentAt: new Date(), sentCount: { increment: 1 }, ...(followUp ? { followUpAt: new Date(`${followUp}T00:00:00Z`), snoozeReason: null } : {}), ...(t.status === "" || t.status === "lead" ? { status: "contacted" } : {}) } });
        }
        results.push({ to: t.email, ok: true, filedInSent: filed, ...(filedError ? { error: `Sent, but not filed in Sent: ${filedError}` } : {}) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "send failed";
        if (!b.test) await db.outreachSend.create({ data: { accountId: s.id, contactId: t.contactId, toEmail: t.email, toName: t.name, subject, bodyMd: b.bodyMd ?? "", messageId, error: msg, batch } }).catch(() => {});
        results.push({ to: t.email, ok: false, error: msg });
      }
      if (i < prepared.length - 1) await wait(1200); // gently: mailboxes treat bursts as spam
    }
    return { code: 200, body: { results, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, skipped, followUpAt: followUp, defaultFollowUp: addDays(today(), s.followUpDays) } };
  }

  app.post<{ Body: ComposeBody }>("/api/outreach/send", { ...W, bodyLimit: 512 * 1024 }, async (req, reply) => { const r = await runSend(req.db, req.ox.id, req.body ?? {}); return reply.code(r.code).send(r.body); });

  // ---- queued sends: a minute-by-minute check over every workspace, so a restart loses nothing (the queue is in the database)
  let busy = false;
  async function drainQueue(): Promise<void> {
    if (busy) return; busy = true;
    try {
      const due = await prisma.outreachScheduled.findMany({ where: { status: "pending", sendAt: { lte: new Date() } }, orderBy: { sendAt: "asc" }, take: 20 });
      for (const q of due) {
        const claim = await prisma.outreachScheduled.updateMany({ where: { id: q.id, status: "pending" }, data: { status: "sending" } });
        if (claim.count !== 1) continue;
        try {
          if (q.workspaceId === null) throw new Error("This queued mail belongs to no workspace.");
          const r = await runSend(dbFor(q.workspaceId), q.workspaceId, q.payload as ComposeBody, { scheduler: true });
          const ok = r.code === 200 && (r.body.sent as number) > 0;
          await prisma.outreachScheduled.update({ where: { id: q.id }, data: { status: ok ? "sent" : "failed", error: ok ? null : String(r.body.error ?? (r.body.results as { error?: string }[] | undefined)?.[0]?.error ?? "not sent") } });
        } catch (e) { await prisma.outreachScheduled.update({ where: { id: q.id }, data: { status: "failed", error: e instanceof Error ? e.message : "failed" } }); }
      }
      await sendDigests(runSend);
      await checkFeeds();
      await checkInboxes(account);
    } catch { /* the database is busy: next minute */ } finally { busy = false; }
  }
  const timer = setInterval(() => { void drainQueue(); }, 60_000); timer.unref();
  app.addHook("onClose", async () => { clearInterval(timer); });
  app.delete<{ Params: { id: string } }>("/api/outreach/scheduled/:id", W, async (req) => { const db = req.db; await db.outreachScheduled.updateMany({ where: { id: Number(req.params.id) || 0, status: "pending" }, data: { status: "cancelled" } }); return { ok: true }; });
  app.post("/api/outreach/scheduled/clear", W, async (req) => { const db = req.db; await db.outreachScheduled.deleteMany({ where: { status: { in: ["sent", "failed", "cancelled"] } } }); return { ok: true }; });

  // ---- templates (a message, with the block choices per group)
  app.post<{ Body: { name?: string; subject?: string; bodyMd?: string; rules?: unknown } }>("/api/outreach/templates", { ...W, bodyLimit: 512 * 1024 }, async (req, reply) => { const db = req.db;
    const b = req.body ?? {}; const name = (b.name ?? "").trim().slice(0, 80); if (!name) return fail(reply, 400, "Name the template.");
    const t = await db.outreachTemplate.create({ data: { name, subject: (b.subject ?? "").slice(0, 200), bodyMd: (b.bodyMd ?? "").slice(0, 100_000), rules: cleanRules(b.rules) as object } });
    return reply.code(201).send({ id: t.id, name: t.name, subject: t.subject, bodyMd: t.bodyMd, rules: t.rules });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; subject?: string; bodyMd?: string; rules?: unknown } }>("/api/outreach/templates/:id", { ...W, bodyLimit: 512 * 1024 }, async (req, reply) => { const db = req.db;
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 80);
    if (typeof b.subject === "string") data.subject = b.subject.slice(0, 200);
    if (typeof b.bodyMd === "string") data.bodyMd = b.bodyMd.slice(0, 100_000);
    if ("rules" in b) data.rules = cleanRules(b.rules) as object;
    const t = await db.outreachTemplate.update({ where: { id: Number(req.params.id) || 0 }, data }).catch(() => null);
    return t ? { id: t.id, name: t.name, subject: t.subject, bodyMd: t.bodyMd, rules: t.rules } : fail(reply, 404, "No such template.");
  });
  app.delete<{ Params: { id: string } }>("/api/outreach/templates/:id", W, async (req) => { const db = req.db; await db.outreachTemplate.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });

  // ---- what you last wrote to someone (for a follow-up that quotes it)
  app.get<{ Params: { id: string } }>("/api/outreach/contacts/:id/last-send", W, async (req, reply) => { const db = req.db;
    const r = await db.outreachSend.findFirst({ where: { contactId: Number(req.params.id) || 0, error: null }, orderBy: { sentAt: "desc" } });
    return r ? { subject: r.subject, bodyMd: r.bodyMd, sentAt: r.sentAt.toISOString().slice(0, 10) } : fail(reply, 404, "Nothing was sent to them from here.");
  });

  // ---- what works
  const statContacts = (cs: { id: number; status: string; repliedAt: Date | null; sentCount: number; groups: { id: number }[]; timezone: string | null; declineReason: string | null }[]) => cs.map((c) => ({ id: c.id, status: c.status, repliedAt: ymd(c.repliedAt), sentCount: c.sentCount, groups: c.groups.map((g) => g.id), timezone: c.timezone, declineReason: c.declineReason }));
  app.get("/api/outreach/stats", W, async (req) => {
    const db = req.db;
    const [cs, ss, gs, bs] = await Promise.all([
      db.outreachContact.findMany({ include: WITH_GROUPS }), db.outreachSend.findMany({ where: { contactId: { not: null }, error: null }, select: { contactId: true, templateName: true, blocksUsed: true, sentAt: true, subjectVariant: true }, orderBy: { sentAt: "desc" }, take: 5000 }),
      db.outreachGroup.findMany(), db.outreachBlock.findMany({ include: { type: true } }),
    ]);
    return computeStats(statContacts(cs), ss.map((x) => ({ contactId: x.contactId, templateName: x.templateName, blocksUsed: (x.blocksUsed ?? null) as { blockId: number }[] | null, sentAt: x.sentAt, variant: x.subjectVariant })), gs, bs.map((b) => ({ id: b.id, title: b.title, kind: b.type.name })));
  });

  // what worked: the exact mail that was accepted, ready to become a template
  app.get("/api/outreach/accepted", W, async (req) => {
    const db = req.db; const cs = await db.outreachContact.findMany({ where: { status: "accepted" }, select: { id: true, name: true, email: true } });
    const out = [];
    for (const c of cs) { const r = await db.outreachSend.findFirst({ where: { contactId: c.id, error: null, source: null }, orderBy: { sentAt: "asc" } }) ?? await db.outreachSend.findFirst({ where: { contactId: c.id, error: null }, orderBy: { sentAt: "asc" } }); if (r) out.push({ contactId: c.id, who: c.name || c.email, subject: r.subject, bodyMd: r.bodyMd, templateName: r.templateName, sentAt: r.sentAt.toISOString().slice(0, 10) }); }
    return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 50);
  });

  app.get<{ Querystring: { contactId?: string; limit?: string } }>("/api/outreach/history", W, async (req) => { const db = req.db;
    const contactId = Number(req.query.contactId) || undefined; const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const rows = await db.outreachSend.findMany({ where: contactId ? { contactId } : {}, orderBy: { sentAt: "desc" }, take: limit });
    return rows.map((r) => ({ id: r.id, contactId: r.contactId, to: r.toName ? `${r.toName} <${r.toEmail}>` : r.toEmail, subject: r.subject, sentAt: r.sentAt, ok: !r.error || r.error.startsWith("Sent, but"), note: r.error, filedInSent: r.filedInSent }));
  });
}
