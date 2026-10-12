import type { FastifyInstance } from "fastify";
import { simpleParser } from "mailparser";
import { zipSync } from "fflate";
import { UPLOADS_DIR } from "../lib/storage.js";
import { renderMail } from "../lib/mailMarkdown.js";
import { buildRaw } from "../lib/outreachMail.js";
import { classifyMail, cleanMessageId, emlFileName, expandMailFiles, type MailFacts } from "../lib/outreachEml.js";
import { htmlToText } from "../lib/outreachPlus.js";
import { isEmail, uploadFile } from "../lib/outreach.js";
import type { ScopedDb } from "../lib/outreachScopeDb.js";
import { fail, type workspaceAuth } from "./outreachShared.js";
import { statSync } from "node:fs";

type Pre = { preHandler: typeof workspaceAuth };

export interface ImportReport { files: number; imported: number; duplicates: number; strays: number; newContacts: number; updatedContacts: number; failed: { name: string; error: string }[]; suggestions: { contactId: number; who: string; hint: string; subject: string }[] }

export async function outreachEmlRoutes(app: FastifyInstance, W: Pre): Promise<void> {
  const own = async (db: ScopedDb): Promise<Set<string>> => new Set((await db.outreachAccount.findMany()).flatMap((a) => [a.fromEmail, a.smtpUser].flatMap((x) => (x && isEmail(x.toLowerCase()) ? [x.toLowerCase()] : []))));

  /** What an application mail does to the sheet: the contact is found or made, dates and counts move, an answer is noted. */
  async function applyToSheet(db: ScopedDb, m: { id: number; direction: string; counterparty: string; name: string; date: Date; subject: string; text: string; messageId: string | null; hint: string | null }, report: ImportReport, touched: Set<number>, made: Set<number>): Promise<number | null> {
    if (!m.counterparty) return null;
    let c = await db.outreachContact.findFirst({ where: { email: m.counterparty } });
    if (!c) {
      c = await db.outreachContact.create({ data: { name: m.direction === "in" ? m.name.slice(0, 120) : "", email: m.counterparty, status: "", source: "eml" } });
      report.newContacts++; made.add(c.id);
    } else if (!made.has(c.id) && !touched.has(c.id)) report.updatedContacts++;
    touched.add(c.id);
    const data: Record<string, unknown> = {};
    if (m.direction === "out") {
      data.sentCount = { increment: 1 }; if (!c.lastSentAt || c.lastSentAt < m.date) data.lastSentAt = new Date(`${m.date.toISOString().slice(0, 10)}T00:00:00Z`);
      if (c.status === "" || c.status === "lead") data.status = "contacted";
      await db.outreachSend.create({ data: { source: "eml", contactId: c.id, toEmail: m.counterparty, toName: c.name, subject: m.subject.slice(0, 200), bodyMd: m.text.slice(0, 20000), messageId: m.messageId, sentAt: m.date } });
    } else {
      const waiting = c.sentCount > 0 || c.status === "contacted" || c.status === "ghosted";
      if (waiting && ["", "lead", "contacted", "ghosted"].includes(c.status)) { data.status = "replied"; data.repliedAt = new Date(`${m.date.toISOString().slice(0, 10)}T00:00:00Z`); data.followUpAt = null; }
      if (m.hint === "decline" || m.hint === "acceptance") report.suggestions.push({ contactId: c.id, who: c.name || c.email, hint: m.hint, subject: m.subject.slice(0, 100) });
    }
    if (Object.keys(data).length) await db.outreachContact.update({ where: { id: c.id }, data });
    return c.id;
  }

  app.post("/api/outreach/eml/import", W, async (req, reply) => {
    const db = req.db; const files: { name: string; buf: Buffer }[] = []; let bytes = 0;
    for await (const part of req.parts()) {
      if (part.type !== "file") continue; const buf = await part.toBuffer(); bytes += buf.length;
      if (bytes > 80 * 1024 * 1024) return fail(reply, 413, "That is over 80 MB of mail files; import them in smaller batches.");
      files.push({ name: part.filename, buf });
    }
    if (!files.length) return fail(reply, 400, "Choose .eml files or a .zip of them.");
    let mails: { name: string; buf: Buffer }[]; try { mails = expandMailFiles(files); } catch (e) { return fail(reply, 422, e instanceof Error ? e.message : "That zip can't be opened."); }
    if (!mails.length) return fail(reply, 422, "No .eml mail files were found.");
    const report: ImportReport = { files: mails.length, imported: 0, duplicates: 0, strays: 0, newContacts: 0, updatedContacts: 0, failed: [], suggestions: [] };

    const mine = await own(db);
    const contacts = await db.outreachContact.findMany({ select: { email: true } });
    const known = new Set<string>(contacts.map((c: { email: string }) => c.email.toLowerCase()).filter(Boolean)); const knownDomains = new Set<string>([...known].map((e) => e.slice(e.lastIndexOf("@") + 1)).filter((d) => !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "protonmail.com", "live.com", "free.fr", "orange.fr"].includes(d)));
    const sentIds = new Set<string>((await db.outreachSend.findMany({ where: { messageId: { not: null } }, select: { messageId: true }, take: 20000 })).flatMap((s) => (s.messageId ? [s.messageId.toLowerCase()] : [])));
    const seen = new Set<string>((await db.outreachMessage.findMany({ where: { messageId: { not: null } }, select: { messageId: true }, take: 50000 })).flatMap((s) => (s.messageId ? [s.messageId.toLowerCase()] : [])));

    type Parsed = { name: string; date: Date; fromEmail: string; fromName: string; to: string[]; subject: string; text: string; messageId: string | null; inReplyTo: string | null; refs: string[]; list: boolean; auto: boolean; atts: { name: string; size: number }[] };
    const parsed: Parsed[] = [];
    for (const f of mails) {
      try {
        const p = await simpleParser(f.buf, { skipHtmlToText: false, skipImageLinks: true, skipTextToHtml: true });
        const from = p.from?.value?.[0]; const to = [p.to, p.cc].flatMap((x) => (x ? (Array.isArray(x) ? x : [x]) : [])).flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
        const text = (p.text?.trim() || (typeof p.html === "string" ? htmlToText(p.html) : "")).replace(/\r/g, "").slice(0, 20000);
        parsed.push({ name: f.name, date: p.date && !Number.isNaN(p.date.getTime()) ? p.date : new Date(), fromEmail: (from?.address ?? "").toLowerCase(), fromName: (from?.name ?? "").slice(0, 120), to, subject: (p.subject ?? "").slice(0, 300), text,
          messageId: cleanMessageId(p.messageId), inReplyTo: cleanMessageId(p.inReplyTo), refs: (Array.isArray(p.references) ? p.references : p.references ? [p.references] : []).flatMap((r) => { const c = cleanMessageId(r); return c ? [c] : []; }),
          list: p.headers.has("list-unsubscribe"), auto: /auto-(?:generated|replied)/i.test(String(p.headers.get("auto-submitted") ?? "")) || /bulk|junk|list/i.test(String(p.headers.get("precedence") ?? "")), atts: (p.attachments ?? []).slice(0, 20).map((a) => ({ name: (a.filename ?? "file").slice(0, 100), size: a.size })) });
      } catch (e) { report.failed.push({ name: f.name, error: e instanceof Error ? e.message.slice(0, 120) : "unreadable" }); }
    }
    parsed.sort((a, b) => a.date.getTime() - b.date.getTime()); // oldest first, so "they answered" comes after "I wrote"
    const touched = new Set<number>(), made = new Set<number>();
    for (const m of parsed) {
      if (m.messageId && seen.has(m.messageId)) { report.duplicates++; continue; }
      if (m.messageId) seen.add(m.messageId);
      const facts: MailFacts = { fromEmail: m.fromEmail, fromName: m.fromName, toEmails: m.to, subject: m.subject, text: m.text, hasListUnsubscribe: m.list, automated: m.auto, inReplyTo: m.inReplyTo, references: m.refs, own: mine, known, knownDomains, sentIds };
      const v = classifyMail(facts);
      const row = await db.outreachMessage.create({ data: { direction: v.direction, fromEmail: m.fromEmail, fromName: m.fromName, toEmails: m.to.join(", ").slice(0, 500), subject: m.subject, date: m.date, messageId: m.messageId, inReplyTo: m.inReplyTo, bodyText: m.text, kind: v.kind, reason: v.reason, hint: v.hint, attachments: m.atts as object } });
      report.imported++;
      if (v.kind === "stray") { report.strays++; continue; }
      const cid = await applyToSheet(db, { id: row.id, direction: v.direction, counterparty: v.counterparty ?? "", name: v.counterpartyName, date: m.date, subject: m.subject, text: m.text, messageId: m.messageId, hint: v.hint }, report, touched, made);
      if (cid) { await db.outreachMessage.update({ where: { id: row.id }, data: { contactId: cid } }); if (v.counterparty) { known.add(v.counterparty); knownDomains.add(v.counterparty.slice(v.counterparty.lastIndexOf("@") + 1)); } }
    }
    return report;
  });

  // ---- the past-mail viewer: mail read from files, plus what was sent from here, newest first
  const snippet = (t: string): string => t.replace(/\s+/g, " ").trim().slice(0, 160);
  app.get<{ Querystring: { kind?: string; q?: string; contactId?: string; limit?: string } }>("/api/outreach/messages", W, async (req) => {
    const db = req.db; const q = (req.query.q ?? "").trim().toLowerCase().slice(0, 80); const contactId = Number(req.query.contactId) || undefined; const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 120));
    const kind = req.query.kind === "stray" ? "stray" : req.query.kind === "all" ? null : "application";
    const [ms, ss] = await Promise.all([
      db.outreachMessage.findMany({ where: { ...(kind ? { kind } : {}), ...(contactId ? { contactId } : {}), ...(q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { bodyText: { contains: q, mode: "insensitive" } }, { fromEmail: { contains: q } }, { toEmails: { contains: q } }] } : {}) }, orderBy: { date: "desc" }, take: limit }),
      kind === "stray" ? Promise.resolve([]) : db.outreachSend.findMany({ where: { source: null, error: null, ...(contactId ? { contactId } : {}), ...(q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { bodyMd: { contains: q, mode: "insensitive" } }, { toEmail: { contains: q } }] } : {}) }, orderBy: { sentAt: "desc" }, take: limit }),
    ]);
    const rows = [
      ...ms.map((m) => ({ key: `m${m.id}`, direction: m.direction, who: m.direction === "out" ? m.toEmails : (m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail), subject: m.subject, date: m.date.toISOString(), snippet: snippet(m.bodyText), kind: m.kind, hint: m.hint, contactId: m.contactId, imported: true })),
      ...ss.map((s) => ({ key: `s${s.id}`, direction: "out", who: s.toName ? `${s.toName} <${s.toEmail}>` : s.toEmail, subject: s.subject, date: s.sentAt.toISOString(), snippet: snippet(s.bodyMd), kind: "application", hint: null as string | null, contactId: s.contactId, imported: false })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  });
  app.get<{ Params: { key: string } }>("/api/outreach/messages/:key", W, async (req, reply) => {
    const db = req.db; const kindCh = req.params.key[0], id = Number(req.params.key.slice(1)) || 0;
    if (kindCh === "m") { const m = await db.outreachMessage.findUnique({ where: { id } }); if (!m) return fail(reply, 404, "No such message."); return { key: `m${m.id}`, direction: m.direction, from: m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail, to: m.toEmails, subject: m.subject, date: m.date.toISOString(), body: m.bodyText, kind: m.kind, reason: m.reason, hint: m.hint, contactId: m.contactId, attachments: m.attachments }; }
    if (kindCh === "s") { const s = await db.outreachSend.findUnique({ where: { id } }); if (!s) return fail(reply, 404, "No such message."); return { key: `s${s.id}`, direction: "out", from: "(you)", to: s.toName ? `${s.toName} <${s.toEmail}>` : s.toEmail, subject: s.subject, date: s.sentAt.toISOString(), body: renderMail(s.bodyMd, { sizeOf: () => null }).text, kind: "application", reason: "", hint: null, contactId: s.contactId, attachments: [] }; }
    return fail(reply, 404, "No such message.");
  });
  app.patch<{ Params: { key: string }; Body: { kind?: string } }>("/api/outreach/messages/:key", W, async (req, reply) => {
    const db = req.db; if (req.params.key[0] !== "m") return fail(reply, 400, "Only imported mail can be re-sorted."); const id = Number(req.params.key.slice(1)) || 0;
    const m = await db.outreachMessage.findUnique({ where: { id } }); if (!m) return fail(reply, 404, "No such message.");
    const kind = req.body?.kind === "stray" ? "stray" : "application"; if (kind === m.kind) return { ok: true };
    await db.outreachMessage.update({ where: { id }, data: { kind, reason: `Marked by hand as ${kind === "application" ? "part of the process" : "unrelated"}` } });
    const report: ImportReport = { files: 1, imported: 0, duplicates: 0, strays: 0, newContacts: 0, updatedContacts: 0, failed: [], suggestions: [] };
    if (kind === "application" && !m.contactId) {
      const mine = await own(db); const out = mine.has(m.fromEmail); const cp = out ? (m.toEmails.split(",").map((x) => x.trim().toLowerCase()).find((e) => isEmail(e) && !mine.has(e)) ?? "") : m.fromEmail;
      const cid = await applyToSheet(db, { id, direction: out ? "out" : "in", counterparty: cp, name: m.fromName, date: m.date, subject: m.subject, text: m.bodyText, messageId: m.messageId, hint: m.hint }, report, new Set(), new Set());
      if (cid) await db.outreachMessage.update({ where: { id }, data: { contactId: cid } });
    }
    return { ok: true, report };
  });
  app.delete<{ Params: { key: string } }>("/api/outreach/messages/:key", W, async (req) => { if (req.params.key[0] === "m") await req.db.outreachMessage.deleteMany({ where: { id: Number(req.params.key.slice(1)) || 0 } }); return { ok: true }; });

  // ---- export: one .eml, or a .zip of many
  app.post<{ Body: { keys?: string[]; contactIds?: number[]; all?: boolean } }>("/api/outreach/eml/export", { ...W, bodyLimit: 512 * 1024 }, async (req, reply) => {
    const db = req.db; const b = req.body ?? {}; const keys = new Set((Array.isArray(b.keys) ? b.keys : []).filter((k) => /^[ms]\d+$/.test(k)).slice(0, 2000));
    const cids = (Array.isArray(b.contactIds) ? b.contactIds.filter(Number.isInteger) : []).slice(0, 500);
    const wantM = [...keys].filter((k) => k[0] === "m").map((k) => Number(k.slice(1))), wantS = [...keys].filter((k) => k[0] === "s").map((k) => Number(k.slice(1)));
    const byContact = cids.length ? { contactId: { in: cids } } : null;
    const [ms, ss] = await Promise.all([
      db.outreachMessage.findMany({ where: b.all ? {} : { OR: [{ id: { in: wantM } }, ...(byContact ? [byContact] : [])] }, orderBy: { date: "asc" }, take: 2000 }),
      db.outreachSend.findMany({ where: b.all ? { error: null } : { OR: [{ id: { in: wantS } }, ...(byContact ? [{ ...byContact, error: null }] : [])] }, orderBy: { sentAt: "asc" }, take: 2000 }),
    ]);
    const accts = await db.outreachAccount.findMany(); const def = accts.find((a) => a.isDefault) ?? accts[0];
    const items: { name: string; build: () => Promise<Buffer> }[] = [];
    for (const m of ms) items.push({ name: emlFileName(m.date, m.subject, `m${m.id}`), build: () => {
      const to = m.toEmails.split(",").map((x) => x.trim()).filter(isEmail);
      return buildRaw({ from: { fromName: m.fromName || null, fromEmail: isEmail(m.fromEmail) ? m.fromEmail : "unknown@invalid.example", replyTo: null }, to: { email: to[0] ?? "unknown@invalid.example" }, cc: to.slice(1), bcc: [], subject: m.subject || "(no subject)", text: m.bodyText, html: "", attachments: [], messageId: m.messageId || `<imported-m${m.id}@outreach.invalid>`, inReplyTo: m.inReplyTo ?? undefined, date: m.date });
    } });
    for (const s of ss) items.push({ name: emlFileName(s.sentAt, s.subject, `s${s.id}`), build: () => {
      const a = accts.find((x) => x.id === s.accountId) ?? def; const r = renderMail(s.bodyMd, { sizeOf: (u) => { const f = uploadFile(u, UPLOADS_DIR); try { return f ? statSync(f).size : null; } catch { return null; } } });
      const files = r.attachments.flatMap((x) => { const p = uploadFile(x.url, UPLOADS_DIR); try { return p && statSync(p).isFile() ? [{ filename: x.filename, path: p, cid: x.cid }] : []; } catch { return []; } });
      return buildRaw({ from: { fromName: a?.fromName ?? null, fromEmail: a?.fromEmail || a?.smtpUser || "me@invalid.example", replyTo: a?.replyTo ?? null }, to: { email: s.toEmail, name: s.toName }, cc: (s.cc ?? "").split(",").map((x) => x.trim()).filter(isEmail), bcc: [], subject: s.subject, text: r.text, html: r.html, attachments: files, messageId: s.messageId || `<sent-s${s.id}@outreach.invalid>`, date: s.sentAt });
    } });
    if (!items.length) return fail(reply, 404, "No mail to export for that choice.");
    if (items.length === 1) { const buf = await items[0].build(); return reply.header("content-type", "message/rfc822").header("content-disposition", `attachment; filename="${items[0].name}"`).send(buf); }
    const files: Record<string, Uint8Array> = {}; const used = new Set<string>();
    for (const it of items) { let n = it.name; for (let i = 2; used.has(n); i++) n = it.name.replace(/\.eml$/, `-${i}.eml`); used.add(n); files[n] = new Uint8Array(await it.build()); }
    return reply.header("content-type", "application/zip").header("content-disposition", `attachment; filename="outreach-mail-${new Date().toISOString().slice(0, 10)}.zip"`).send(Buffer.from(zipSync(files, { level: 1 })));
  });
}
