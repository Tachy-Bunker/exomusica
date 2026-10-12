import type { FastifyReply, FastifyRequest } from "fastify";
import { lookup as dnsLookup } from "node:dns/promises";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";
import { readWorkspaceToken } from "../lib/outreachScope.js";
import { scopedDb, type ScopedDb } from "../lib/outreachScopeDb.js";
import { isPublicAddress } from "../lib/outreachPlus.js";
import { cleanColumnInput, cleanCell, MAX_COLUMNS, slugKey } from "../lib/outreach.js";

type Workspace = NonNullable<Awaited<ReturnType<typeof prisma.outreachWorkspace.findUnique>>>;
declare module "fastify" {
  interface FastifyRequest { ox: Workspace; db: ScopedDb }
}

export const today = (): string => new Date().toISOString().slice(0, 10);
export const ymd = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const fail = (reply: FastifyReply, code: number, error: string, extra: object = {}) => reply.code(code).send({ error, ...extra });
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dbCache = new Map<number, ScopedDb>();
export const dbFor = (id: number): ScopedDb => { let d = dbCache.get(id); if (!d) { d = scopedDb(id); dbCache.set(id, d); if (dbCache.size > 200) dbCache.delete(dbCache.keys().next().value as number); } return d; };

/** Enter with the workspace's token (shared password) or as the site's admin. */
export async function workspaceAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const wid = Number(req.headers["x-outreach-ws"]);
  if (!Number.isInteger(wid) || wid < 1) { void fail(reply, 401, "Choose a workspace first.", { locked: true }); return; }
  const ws = await prisma.outreachWorkspace.findUnique({ where: { id: wid } });
  if (!ws) { void fail(reply, 404, "No such workspace.", { locked: true }); return; }
  const tok = readWorkspaceToken(String(req.headers["x-outreach-token"] ?? ""));
  let ok = !!tok && tok.w === ws.id && tok.v === ws.tokenVersion;
  if (!ok) { const h = req.headers.authorization; if (h?.startsWith("Bearer ")) ok = !!verifyToken(h.slice(7))?.isAdmin; }
  if (!ok) { void fail(reply, 401, "This workspace is locked: enter its password.", { locked: true }); return; }
  req.ox = ws; req.db = dbFor(ws.id);
}

type ContactRow = { status?: string; deadline?: Date | null; repliedAt?: Date | null; timezone?: string | null; groups?: { id: number }[]; id: number; name: string; email: string; data: unknown; lastSentAt: Date | null; sentCount: number; followUpAt: Date | null;
  place?: string; lat?: number | null; lng?: number | null; source?: string | null; doNotContact?: boolean; snoozeReason?: string | null; declineReason?: string | null; reopensAt?: Date | null };
export const shapeContact = (c: ContactRow) => ({ id: c.id, name: c.name, email: c.email, data: (c.data ?? {}) as Record<string, unknown>, lastSentAt: ymd(c.lastSentAt), sentCount: c.sentCount, followUpAt: ymd(c.followUpAt), status: c.status ?? "", deadline: ymd(c.deadline ?? null), repliedAt: ymd(c.repliedAt ?? null), timezone: c.timezone ?? "", groups: (c.groups ?? []).map((g) => g.id),
  place: c.place ?? "", lat: c.lat ?? null, lng: c.lng ?? null, source: c.source ?? "", doNotContact: !!c.doNotContact, snoozeReason: c.snoozeReason ?? "", declineReason: c.declineReason ?? "", reopensAt: ymd(c.reopensAt ?? null) });
export const WITH_GROUPS = { groups: { select: { id: true } } } as const;

/** Columns by name, created (typed) when missing: how an imported card's phone or a captured call's fee gets somewhere to live. */
export async function ensureColumns(db: ScopedDb, want: { name: string; type: string }[]): Promise<Map<string, string>> {
  const have = await db.outreachColumn.findMany({ orderBy: { position: "asc" } }); const out = new Map<string, string>();
  const nm = (x: string) => x.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  let pos = Math.max(-1, ...have.map((c) => c.position)) + 1; const taken = have.map((c) => c.key);
  for (const w of want) {
    const hit = have.find((c) => nm(c.name) === nm(w.name)); if (hit) { out.set(w.name, hit.key); continue; }
    if (have.length >= MAX_COLUMNS) continue;
    const c = cleanColumnInput({ name: w.name, type: w.type }); if (!c) continue;
    const row = await db.outreachColumn.create({ data: { key: slugKey(c.name, taken), name: c.name, type: c.type, position: pos++ } });
    taken.push(row.key); have.push(row); out.set(w.name, row.key);
  }
  return out;
}

/** Sets one column's value on a contact, cleaned for the column's type. */
export async function setCell(db: ScopedDb, contactId: number, column: { name: string; type: string }, value: unknown): Promise<void> {
  const keys = await ensureColumns(db, [column]); const key = keys.get(column.name); if (!key) return;
  const col = await db.outreachColumn.findFirst({ where: { key } }); const v = col ? cleanCell(col.type, col.options, value) : null; if (v === null || v === "") return;
  const cur = await db.outreachContact.findUnique({ where: { id: contactId } }); if (!cur) return;
  await db.outreachContact.update({ where: { id: contactId }, data: { data: { ...((cur.data ?? {}) as object), [key]: v } as object } });
}

// ---- reading an open call from a link or pasted text
export async function fetchPage(url: string, opts: { feed?: boolean } = {}): Promise<{ html: string; finalUrl: string } | string> {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL; try { u = new URL(cur); } catch { return "That isn't a web address."; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return "Only web addresses (http/https) can be read.";
    if (u.port && u.port !== "80" && u.port !== "443") return "Only ordinary web ports are read.";
    let addrs: { address: string }[]; try { addrs = await dnsLookup(u.hostname, { all: true }); } catch { return "That address doesn't resolve."; }
    if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address))) return "That address points inside a private network; only public pages are read.";
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (compatible; ExomusicaOutreach/1.0)", accept: "text/html,text/plain;q=0.8" } }).catch(() => null);
    if (!res) return "The page didn't answer in time.";
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { cur = new URL(res.headers.get("location") as string, u).toString(); continue; }
    if (!res.ok) return `The page answered ${res.status}.`;
    const type = res.headers.get("content-type") ?? ""; if (!(opts.feed ? /xml|rss|atom|text\/plain/i : /text\/(html|plain)|xhtml/i).test(type)) return opts.feed ? "That isn't a feed I can read." : "That isn't a web page I can read.";
    const reader = res.body?.getReader(); if (!reader) return "The page was empty.";
    const chunks: Uint8Array[] = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > 1_500_000) { await reader.cancel(); break; } chunks.push(value); }
    return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: cur };
  }
  return "Too many redirects.";
}
