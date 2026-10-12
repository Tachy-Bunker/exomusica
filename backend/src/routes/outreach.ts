import type { FastifyInstance, FastifyReply } from "fastify";
import { parse } from "csv-parse/sync";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { seal, unseal } from "../lib/secretBox.js";
import { renderMail } from "../lib/mailMarkdown.js";
import { buildRaw, deliver, fileCopyInSent, messageIdFor, verifyAccount, type MailAccount } from "../lib/outreachMail.js";
import {
  addDays, cleanCell, cleanColumnInput, dateOnly, fieldValues, fillFields, isEmail, MAX_ATTACH_BYTES, MAX_COLUMNS, MAX_RECIPIENTS, parseAddresses, planImport, slugKey, uploadFile, type ColumnDef,
} from "../lib/outreach.js";

const SECRET = (): string => process.env.OUTREACH_SECRET ?? process.env.JWT_SECRET ?? "";
const today = (): string => new Date().toISOString().slice(0, 10);
const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const FILE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".pdf", ".zip", ".txt", ".doc", ".docx", ".odt", ".rtf", ".mid", ".midi"]);
const fail = (reply: FastifyReply, code: number, error: string, extra: object = {}) => reply.code(code).send({ error, ...extra });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ContactRow = { id: number; name: string; email: string; data: unknown; lastSentAt: Date | null; sentCount: number; followUpAt: Date | null };
const shapeContact = (c: ContactRow) => ({ id: c.id, name: c.name, email: c.email, data: (c.data ?? {}) as Record<string, unknown>, lastSentAt: ymd(c.lastSentAt), sentCount: c.sentCount, followUpAt: ymd(c.followUpAt) });
type SettingsRow = Awaited<ReturnType<typeof prisma.outreachSettings.upsert>>;
const shapeSettings = (s: SettingsRow) => ({
  smtpHost: s.smtpHost ?? "", smtpPort: s.smtpPort ?? 465, smtpSecure: s.smtpSecure, smtpUser: s.smtpUser ?? "", hasPassword: !!s.smtpPasswordEnc,
  fromName: s.fromName ?? "", fromEmail: s.fromEmail ?? "", replyTo: s.replyTo ?? "", defaultCc: s.defaultCc ?? "", defaultBcc: s.defaultBcc ?? "",
  imapHost: s.imapHost ?? "", imapPort: s.imapPort ?? 993, imapSecure: s.imapSecure, sentFolder: s.sentFolder, fileInSent: s.fileInSent, signatureMd: s.signatureMd, followUpDays: s.followUpDays,
});
const getSettings = () => prisma.outreachSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

function account(s: SettingsRow): MailAccount | string {
  const pass = unseal(s.smtpPasswordEnc, SECRET());
  if (!s.smtpHost || !s.smtpUser) return "Set your mail server and login in the settings first.";
  if (!pass) return s.smtpPasswordEnc ? "The saved password can't be read (the server's secret changed). Enter it again in the settings." : "Enter your mailbox password in the settings first.";
  const fromEmail = (s.fromEmail || s.smtpUser).trim();
  if (!isEmail(fromEmail)) return "The From address is not an email address.";
  return { smtpHost: s.smtpHost, smtpPort: s.smtpPort ?? 465, smtpSecure: s.smtpSecure, smtpUser: s.smtpUser, smtpPassword: pass, fromName: s.fromName, fromEmail, replyTo: s.replyTo, imapHost: s.imapHost, imapPort: s.imapPort, imapSecure: s.imapSecure, sentFolder: s.sentFolder, fileInSent: s.fileInSent };
}

async function recleanColumn(key: string, type: string, options: unknown): Promise<void> {
  const rows = await prisma.outreachContact.findMany({ select: { id: true, data: true } });
  const ops = rows.flatMap((r) => {
    const d = { ...((r.data ?? {}) as Record<string, unknown>) }; if (!(key in d)) return [];
    const v = cleanCell(type, options, d[key]);
    if (v === null || (Array.isArray(v) && v.length === 0)) delete d[key]; else d[key] = v;
    return [prisma.outreachContact.update({ where: { id: r.id }, data: { data: d as object } })];
  });
  if (ops.length) await prisma.$transaction(ops);
}

export async function outreachRoutes(app: FastifyInstance): Promise<void> {
  const A = { preHandler: requireAdmin };

  app.get("/api/admin/outreach/state", A, async () => {
    const [settings, columns, contacts, blockTypes] = await Promise.all([
      getSettings(),
      prisma.outreachColumn.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }),
      prisma.outreachContact.findMany({ orderBy: { id: "asc" } }),
      prisma.outreachBlockType.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], include: { blocks: { orderBy: [{ position: "asc" }, { id: "asc" }] } } }),
    ]);
    return {
      settings: shapeSettings(settings),
      columns: columns.map((c) => ({ id: c.id, key: c.key, name: c.name, type: c.type, options: (c.options as string[] | null) ?? [], hidden: c.hidden, width: c.width })),
      contacts: contacts.map(shapeContact),
      blockTypes: blockTypes.map((t) => ({ id: t.id, name: t.name, blocks: t.blocks.map((b) => ({ id: b.id, typeId: b.typeId, title: b.title, body: b.body })) })),
      today: today(),
    };
  });

  app.get("/api/admin/outreach/due", A, async () => {
    const rows = await prisma.outreachContact.findMany({ where: { followUpAt: { lte: new Date(`${today()}T23:59:59Z`) } }, orderBy: { followUpAt: "asc" }, select: { id: true, name: true, email: true, followUpAt: true }, take: 50 });
    return { count: rows.length, contacts: rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name || r.email, followUpAt: ymd(r.followUpAt) })) };
  });

  // ---- settings
  app.put<{ Body: Record<string, unknown> }>("/api/admin/outreach/settings", { ...A, bodyLimit: 64 * 1024 }, async (req, reply) => {
    const b = req.body ?? {};
    const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const port = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null; };
    const data: Record<string, unknown> = {};
    if ("smtpHost" in b) data.smtpHost = str(b.smtpHost);
    if ("smtpPort" in b) data.smtpPort = port(b.smtpPort);
    if ("smtpSecure" in b) data.smtpSecure = b.smtpSecure !== false;
    if ("smtpUser" in b) data.smtpUser = str(b.smtpUser);
    if ("fromName" in b) data.fromName = str(b.fromName, 80);
    if ("fromEmail" in b) { const e = str(b.fromEmail); if (e && !isEmail(e.toLowerCase())) return fail(reply, 400, "The From address is not an email address."); data.fromEmail = e; }
    if ("replyTo" in b) { const e = str(b.replyTo); if (e && !isEmail(e.toLowerCase())) return fail(reply, 400, "The Reply-To address is not an email address."); data.replyTo = e; }
    for (const k of ["defaultCc", "defaultBcc"] as const) if (k in b) { const p = parseAddresses(b[k]); if (p.bad.length) return fail(reply, 400, `Not an email address: ${p.bad[0]}`); data[k] = p.ok.join(", ") || null; }
    if ("imapHost" in b) data.imapHost = str(b.imapHost);
    if ("imapPort" in b) data.imapPort = port(b.imapPort);
    if ("imapSecure" in b) data.imapSecure = b.imapSecure !== false;
    if ("sentFolder" in b) data.sentFolder = str(b.sentFolder, 80) ?? "Sent";
    if ("fileInSent" in b) data.fileInSent = b.fileInSent === true;
    if ("signatureMd" in b) data.signatureMd = typeof b.signatureMd === "string" ? b.signatureMd.slice(0, 5000) : "";
    if ("followUpDays" in b) { const n = Number(b.followUpDays); data.followUpDays = Number.isInteger(n) && n >= 1 && n <= 365 ? n : 14; }
    if (b.clearPassword === true) data.smtpPasswordEnc = null;
    else if (typeof b.password === "string" && b.password) { try { data.smtpPasswordEnc = seal(b.password, SECRET()); } catch (e) { return fail(reply, 500, e instanceof Error ? e.message : "couldn't protect the password"); } }
    const s = await prisma.outreachSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    return shapeSettings(s);
  });

  app.post("/api/admin/outreach/settings/test", A, async (_req, reply) => {
    const a = account(await getSettings()); if (typeof a === "string") return fail(reply, 400, a);
    return verifyAccount(a);
  });

  // ---- columns
  app.post<{ Body: { name?: string; type?: string; options?: unknown } }>("/api/admin/outreach/columns", A, async (req, reply) => {
    const c = cleanColumnInput(req.body ?? {}); if (!c) return fail(reply, 400, "Give the column a name.");
    const all = await prisma.outreachColumn.findMany({ select: { key: true, position: true } });
    if (all.length >= MAX_COLUMNS) return fail(reply, 409, `A sheet holds ${MAX_COLUMNS} columns at most.`);
    const col = await prisma.outreachColumn.create({ data: { key: slugKey(c.name, all.map((x) => x.key)), name: c.name, type: c.type, options: c.options ?? undefined, position: Math.max(-1, ...all.map((x) => x.position)) + 1 } });
    return reply.code(201).send({ id: col.id, key: col.key, name: col.name, type: col.type, options: c.options ?? [], hidden: false, width: null });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; type?: string; options?: unknown; hidden?: boolean; width?: number | null } }>("/api/admin/outreach/columns/:id", A, async (req, reply) => {
    const id = Number(req.params.id) || 0; const cur = await prisma.outreachColumn.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such column.");
    const b = req.body ?? {};
    const c = cleanColumnInput({ name: b.name ?? cur.name, type: b.type ?? cur.type, options: "options" in b ? b.options : cur.options });
    if (!c) return fail(reply, 400, "Give the column a name.");
    const col = await prisma.outreachColumn.update({ where: { id }, data: { name: c.name, type: c.type, options: c.options ?? undefined, ...(typeof b.hidden === "boolean" ? { hidden: b.hidden } : {}), ...("width" in b ? { width: typeof b.width === "number" ? Math.max(60, Math.min(600, Math.round(b.width))) : null } : {}) } });
    if (c.type !== cur.type || JSON.stringify(c.options) !== JSON.stringify(cur.options ?? null)) await recleanColumn(cur.key, c.type, c.options);
    return { id: col.id, key: col.key, name: col.name, type: col.type, options: (col.options as string[] | null) ?? [], hidden: col.hidden, width: col.width };
  });
  app.delete<{ Params: { id: string } }>("/api/admin/outreach/columns/:id", A, async (req, reply) => {
    const id = Number(req.params.id) || 0; const cur = await prisma.outreachColumn.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such column.");
    await prisma.outreachColumn.delete({ where: { id } });
    const rows = await prisma.outreachContact.findMany({ select: { id: true, data: true } });
    const ops = rows.flatMap((r) => { const d = { ...((r.data ?? {}) as Record<string, unknown>) }; if (!(cur.key in d)) return []; delete d[cur.key]; return [prisma.outreachContact.update({ where: { id: r.id }, data: { data: d as object } })]; });
    if (ops.length) await prisma.$transaction(ops);
    return { ok: true };
  });
  app.put<{ Body: { ids?: number[] } }>("/api/admin/outreach/columns/order", A, async (req, reply) => {
    const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list of column ids.");
    await prisma.$transaction(ids.map((id, position) => prisma.outreachColumn.update({ where: { id }, data: { position } })));
    return { ok: true };
  });

  // ---- contacts
  app.post<{ Body: { name?: string; email?: string } }>("/api/admin/outreach/contacts", A, async (req, reply) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const c = await prisma.outreachContact.create({ data: { name: typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "", email: isEmail(email) ? email : "", data: {} } });
    return reply.code(201).send(shapeContact(c));
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; email?: string; set?: Record<string, unknown>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null } }>("/api/admin/outreach/contacts/:id", A, async (req, reply) => {
    const id = Number(req.params.id) || 0; const cur = await prisma.outreachContact.findUnique({ where: { id } });
    if (!cur) return fail(reply, 404, "No such contact.");
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if ("name" in b) data.name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
    if ("email" in b) { const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""; if (e && !isEmail(e)) return fail(reply, 400, "That is not an email address."); data.email = e; }
    if ("lastSentAt" in b) data.lastSentAt = b.lastSentAt ? (dateOnly(b.lastSentAt) ? new Date(`${dateOnly(b.lastSentAt)}T00:00:00Z`) : null) : null;
    if ("followUpAt" in b) data.followUpAt = b.followUpAt ? (dateOnly(b.followUpAt) ? new Date(`${dateOnly(b.followUpAt)}T00:00:00Z`) : null) : null;
    if ("sentCount" in b) { const n = Math.round(Number(b.sentCount)); data.sentCount = Number.isFinite(n) ? Math.max(0, Math.min(9999, n)) : 0; }
    if (b.set && typeof b.set === "object") {
      const cols = await prisma.outreachColumn.findMany(); const d = { ...((cur.data ?? {}) as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b.set)) {
        const col = cols.find((x) => x.key === k); if (!col) continue;
        const x = cleanCell(col.type, col.options, v);
        if (x === null || x === "" || (Array.isArray(x) && x.length === 0) || x === false) delete d[k]; else d[k] = x;
      }
      data.data = d;
    }
    return shapeContact(await prisma.outreachContact.update({ where: { id }, data }));
  });
  app.post<{ Body: { ids?: number[] } }>("/api/admin/outreach/contacts/delete", A, async (req, reply) => {
    const ids = req.body?.ids; if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) return fail(reply, 400, "ids must be a list of contact ids.");
    const r = await prisma.outreachContact.deleteMany({ where: { id: { in: ids } } });
    return { deleted: r.count };
  });
  app.post<{ Body: { csv?: string } }>("/api/admin/outreach/contacts/import", { ...A, bodyLimit: 3 * 1024 * 1024 }, async (req, reply) => {
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) return fail(reply, 400, "Paste or choose a CSV first.");
    const first = csv.split(/\r?\n/, 1)[0]; const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((x, y) => y[1] - x[1])[0][0];
    let rows: string[][]; try { rows = parse(csv, { delimiter, relax_column_count: true, skip_empty_lines: true, bom: true, relax_quotes: true }) as string[][]; } catch { return fail(reply, 400, "That doesn't read as a CSV."); }
    if (rows.length < 2) return fail(reply, 400, "The first row must be the column names, followed by contacts.");
    const cols = await prisma.outreachColumn.findMany({ orderBy: { position: "asc" } });
    const plan = planImport(rows[0], rows.slice(1), cols as unknown as ColumnDef[]);
    let pos = Math.max(-1, ...cols.map((c) => c.position)) + 1;
    for (const c of plan.newColumns) await prisma.outreachColumn.create({ data: { key: c.key, name: c.name, type: c.type, position: pos++ } });
    await prisma.outreachContact.createMany({ data: plan.contacts.map((c) => ({ name: c.name, email: c.email, data: c.data as object, lastSentAt: c.lastSentAt ? new Date(`${c.lastSentAt}T00:00:00Z`) : null, sentCount: c.sentCount, followUpAt: c.followUpAt ? new Date(`${c.followUpAt}T00:00:00Z`) : null })) });
    return { added: plan.contacts.length, skipped: plan.skipped, newColumns: plan.newColumns.map((c) => c.name) };
  });

  // ---- blocks of text
  app.post<{ Body: { name?: string } }>("/api/admin/outreach/block-types", A, async (req, reply) => {
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the kind of block.");
    const last = await prisma.outreachBlockType.findFirst({ orderBy: { position: "desc" } });
    const t = await prisma.outreachBlockType.create({ data: { name, position: (last?.position ?? -1) + 1 } });
    return reply.code(201).send({ id: t.id, name: t.name, blocks: [] });
  });
  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/admin/outreach/block-types/:id", A, async (req, reply) => {
    const name = (req.body?.name ?? "").trim().slice(0, 60); if (!name) return fail(reply, 400, "Name the kind of block.");
    const t = await prisma.outreachBlockType.update({ where: { id: Number(req.params.id) || 0 }, data: { name } }).catch(() => null);
    return t ? { id: t.id, name: t.name } : fail(reply, 404, "No such kind of block.");
  });
  app.delete<{ Params: { id: string } }>("/api/admin/outreach/block-types/:id", A, async (req) => { await prisma.outreachBlockType.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });
  app.post<{ Body: { typeId?: number; title?: string; body?: string } }>("/api/admin/outreach/blocks", { ...A, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const b = req.body ?? {}; const title = (b.title ?? "").trim().slice(0, 80);
    if (!title || !Number.isInteger(b.typeId)) return fail(reply, 400, "A block needs a kind and a title.");
    const type = await prisma.outreachBlockType.findUnique({ where: { id: b.typeId as number } }); if (!type) return fail(reply, 404, "No such kind of block.");
    const last = await prisma.outreachBlock.findFirst({ where: { typeId: type.id }, orderBy: { position: "desc" } });
    const blk = await prisma.outreachBlock.create({ data: { typeId: type.id, title, body: (b.body ?? "").slice(0, 20000), position: (last?.position ?? -1) + 1 } });
    return reply.code(201).send({ id: blk.id, typeId: blk.typeId, title: blk.title, body: blk.body });
  });
  app.patch<{ Params: { id: string }; Body: { typeId?: number; title?: string; body?: string } }>("/api/admin/outreach/blocks/:id", { ...A, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if (typeof b.title === "string") { const t = b.title.trim().slice(0, 80); if (!t) return fail(reply, 400, "A block needs a title."); data.title = t; }
    if (typeof b.body === "string") data.body = b.body.slice(0, 20000);
    if (Number.isInteger(b.typeId)) data.typeId = b.typeId;
    const blk = await prisma.outreachBlock.update({ where: { id: Number(req.params.id) || 0 }, data }).catch(() => null);
    return blk ? { id: blk.id, typeId: blk.typeId, title: blk.title, body: blk.body } : fail(reply, 404, "No such block.");
  });
  app.delete<{ Params: { id: string } }>("/api/admin/outreach/blocks/:id", A, async (req) => { await prisma.outreachBlock.delete({ where: { id: Number(req.params.id) || 0 } }).catch(() => null); return { ok: true }; });

  // ---- files that go into a message (pictures show in the body; audio and other files are attached)
  app.post("/api/admin/outreach/files", A, async (req, reply) => {
    const file = await req.file(); if (!file) return fail(reply, 400, "No file uploaded.");
    const ext = path.extname(file.filename).toLowerCase();
    if (!FILE_EXT.has(ext)) return fail(reply, 400, `Files of type "${ext || "unknown"}" can't be attached (pictures, audio, PDF, zip, text and documents can).`);
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_ATTACH_BYTES) return fail(reply, 413, "That file is over 20 MB: mail providers would refuse the message.");
    const safe = path.basename(file.filename, ext).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
    const dir = path.join(UPLOADS_DIR, "outreach"); await mkdir(dir, { recursive: true });
    const disk = `${randomBytes(4).toString("hex")}-${safe}${ext}`;
    await writeFile(path.join(dir, disk), buffer);
    return reply.code(201).send({ url: `/uploads/outreach/${disk}`, filename: `${safe}${ext}`, mimeType: file.mimetype, sizeBytes: buffer.length });
  });

  // ---- preview and send
  type ComposeBody = { subject?: string; bodyMd?: string; contactId?: number | null; contactIds?: number[]; extraTo?: string; cc?: string; bcc?: string; followUpAt?: string | null; test?: boolean; signature?: boolean; fileInSent?: boolean; allowMissing?: boolean };
  const withSignature = (md: string, s: SettingsRow, on: boolean | undefined): string => (on !== false && s.signatureMd.trim() ? `${md.trimEnd()}\n\n${s.signatureMd.trim()}` : md);
  const sizeOf = (url: string): number | null => { const f = uploadFile(url, UPLOADS_DIR); try { return f ? statSync(f).size : null; } catch { return null; } };
  const SAMPLE: ColumnDef[] = [];

  async function renderFor(s: SettingsRow, columns: ColumnDef[], b: ComposeBody, who: { name: string; email: string; data: Record<string, unknown>; lastSentAt: Date | null; sentCount: number }) {
    const vals = fieldValues(who, columns);
    const body = fillFields(withSignature(b.bodyMd ?? "", s, b.signature), vals), subject = fillFields(b.subject ?? "", vals);
    const rendered = renderMail(body.text, { sizeOf });
    return { rendered, subject: subject.text, missing: [...new Set([...body.missing, ...subject.missing])] };
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

  app.post<{ Body: ComposeBody }>("/api/admin/outreach/preview", { ...A, bodyLimit: 512 * 1024 }, async (req) => {
    const b = req.body ?? {}; const [s, cols] = await Promise.all([getSettings(), prisma.outreachColumn.findMany({ orderBy: { position: "asc" } })]);
    const contact = Number.isInteger(b.contactId) ? await prisma.outreachContact.findUnique({ where: { id: b.contactId as number } }) : null;
    const who = contact ? { name: contact.name, email: contact.email, data: (contact.data ?? {}) as Record<string, unknown>, lastSentAt: contact.lastSentAt, sentCount: contact.sentCount } : { name: "Alex Example", email: "alex@example.org", data: {}, lastSentAt: null, sentCount: 0 };
    const r = await renderFor(s, cols as unknown as ColumnDef[], b, who);
    const chk = checkFiles(r.rendered);
    return { html: r.rendered.html, text: r.rendered.text, subject: r.subject, missing: contact ? r.missing : [], warnings: [...r.rendered.warnings, ...(chk.error ? [chk.error] : [])], attachments: r.rendered.attachments.map((a) => ({ filename: a.filename, kind: a.kind, size: sizeOf(a.url) })), sampleContact: !contact, sample: SAMPLE.length };
  });

  app.post<{ Body: ComposeBody }>("/api/admin/outreach/send", { ...A, bodyLimit: 512 * 1024 }, async (req, reply) => {
    const b = req.body ?? {};
    const s = await getSettings(); const acct = account(s); if (typeof acct === "string") return fail(reply, 400, acct);
    const subjectRaw = (b.subject ?? "").trim(); if (!subjectRaw) return fail(reply, 400, "Write a subject.");
    if (!(b.bodyMd ?? "").trim()) return fail(reply, 400, "The message is empty.");
    const cc = parseAddresses(b.cc), bcc = parseAddresses(b.bcc);
    if (cc.bad.length || bcc.bad.length) return fail(reply, 400, `Not an email address: ${[...cc.bad, ...bcc.bad][0]}`);
    const cols = (await prisma.outreachColumn.findMany({ orderBy: { position: "asc" } })) as unknown as ColumnDef[];

    type Target = { contactId: number | null; name: string; email: string; data: Record<string, unknown>; lastSentAt: Date | null; sentCount: number };
    const targets: Target[] = []; const skipped: string[] = [];
    if (b.test) targets.push({ contactId: null, name: "", email: acct.fromEmail, data: {}, lastSentAt: null, sentCount: 0 });
    else {
      const ids = Array.isArray(b.contactIds) ? b.contactIds.filter(Number.isInteger) : [];
      const rows = ids.length ? await prisma.outreachContact.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }) : [];
      for (const c of rows) { if (isEmail(c.email)) targets.push({ contactId: c.id, name: c.name, email: c.email, data: (c.data ?? {}) as Record<string, unknown>, lastSentAt: c.lastSentAt, sentCount: c.sentCount }); else skipped.push(c.name || `#${c.id}`); }
      const extra = parseAddresses(b.extraTo); if (extra.bad.length) return fail(reply, 400, `Not an email address: ${extra.bad[0]}`);
      for (const e of extra.ok) if (!targets.some((t) => t.email === e)) targets.push({ contactId: null, name: "", email: e, data: {}, lastSentAt: null, sentCount: 0 });
    }
    if (targets.length === 0) return fail(reply, 400, skipped.length ? `None of the chosen contacts has an email address (${skipped.slice(0, 3).join(", ")}).` : "Choose who to write to.");
    if (targets.length > MAX_RECIPIENTS) return fail(reply, 400, `At most ${MAX_RECIPIENTS} people per send.`);

    // Everything is checked before the first message leaves: missing fields, missing files, size.
    const prepared: { t: Target; subject: string; rendered: ReturnType<typeof renderMail>; files: ReturnType<typeof checkFiles>["files"] }[] = [];
    const holes: { to: string; fields: string[] }[] = [];
    for (const t of targets) {
      const r = await renderFor(s, cols, b, t);
      if (r.missing.length) holes.push({ to: t.name || t.email, fields: r.missing });
      const chk = checkFiles(r.rendered); if (chk.error) return fail(reply, 400, chk.error);
      if (!r.subject.trim()) return fail(reply, 400, "The subject came out empty.");
      prepared.push({ t, subject: r.subject.trim().slice(0, 200), rendered: r.rendered, files: chk.files });
    }
    if (holes.length && !b.allowMissing) return fail(reply, 409, "Some fields are empty for some contacts.", { missing: holes });

    const followUp = dateOnly(b.followUpAt ?? undefined); const batch = randomBytes(5).toString("hex");
    const results: { to: string; ok: boolean; error?: string; filedInSent?: boolean }[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const { t, subject, rendered, files } = prepared[i];
      const messageId = messageIdFor(acct.fromEmail);
      const common = { from: acct, to: { email: t.email, name: t.name }, cc: cc.ok, bcc: bcc.ok, subject, text: rendered.text, html: rendered.html, attachments: files, messageId };
      try {
        const raw = await buildRaw(common);
        await deliver(acct, raw, [t.email, ...cc.ok, ...bcc.ok]);
        let filed = false, filedError: string | null = null;
        if ((b.fileInSent ?? acct.fileInSent) && acct.imapHost) { filedError = await fileCopyInSent(acct, await buildRaw({ ...common, keepBcc: true })); filed = filedError === null; }
        if (!b.test) {
          await prisma.outreachSend.create({ data: { contactId: t.contactId, toEmail: t.email, toName: t.name, subject, bodyMd: b.bodyMd ?? "", cc: cc.ok.join(", ") || null, bcc: bcc.ok.join(", ") || null, messageId, filedInSent: filed, error: filedError ? `Sent, but not filed in Sent: ${filedError}` : null, batch } });
          if (t.contactId) await prisma.outreachContact.update({ where: { id: t.contactId }, data: { lastSentAt: new Date(), sentCount: { increment: 1 }, ...(followUp ? { followUpAt: new Date(`${followUp}T00:00:00Z`) } : {}) } });
        }
        results.push({ to: t.email, ok: true, filedInSent: filed, ...(filedError ? { error: `Sent, but not filed in Sent: ${filedError}` } : {}) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "send failed";
        if (!b.test) await prisma.outreachSend.create({ data: { contactId: t.contactId, toEmail: t.email, toName: t.name, subject, bodyMd: b.bodyMd ?? "", messageId, error: msg, batch } }).catch(() => {});
        results.push({ to: t.email, ok: false, error: msg });
      }
      if (i < prepared.length - 1) await wait(1200); // gently: mailboxes treat bursts as spam
    }
    return { results, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, skipped, followUpAt: followUp, defaultFollowUp: addDays(today(), s.followUpDays) };
  });

  app.get<{ Querystring: { contactId?: string; limit?: string } }>("/api/admin/outreach/history", A, async (req) => {
    const contactId = Number(req.query.contactId) || undefined; const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const rows = await prisma.outreachSend.findMany({ where: contactId ? { contactId } : {}, orderBy: { sentAt: "desc" }, take: limit });
    return rows.map((r) => ({ id: r.id, contactId: r.contactId, to: r.toName ? `${r.toName} <${r.toEmail}>` : r.toEmail, subject: r.subject, sentAt: r.sentAt, ok: !r.error || r.error.startsWith("Sent, but"), note: r.error, filedInSent: r.filedInSent }));
  });
}
