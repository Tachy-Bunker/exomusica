// Pure rules for the Outreach panel (contact sheet + composer): column types, cell cleaning, merge fields, CSV. No database in here, so all of it is tested.

export const COLUMN_TYPES = ["text", "longtext", "number", "date", "checkbox", "select", "multiselect", "url", "email", "rating"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export const MAX_COLUMNS = 40;
export interface ColumnDef { key: string; name: string; type: string; options?: unknown }

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
export const isEmail = (s: string): boolean => s.length <= 254 && EMAIL.test(s);
const RESERVED = new Set(["name", "first_name", "email", "last_sent", "sent_count", "follow_up"]);

/** A merge-field name from a column's title: lower case, letters, digits and underscores, never one of the built-in names, never taken. */
export function slugKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "column";
  if (/^\d/.test(base)) base = `c_${base}`;
  let k = base, i = 2;
  while (used.has(k) || RESERVED.has(k)) k = `${base}_${i++}`;
  return k;
}

export function cleanOptions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const o of v) { const s = typeof o === "string" ? o.trim().slice(0, 40) : ""; if (s && !out.includes(s) && out.length < 30) out.push(s); }
  return out;
}
export function cleanColumnInput(b: { name?: unknown; type?: unknown; options?: unknown }): { name: string; type: ColumnType; options: string[] | null } | null {
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return null;
  const type = (COLUMN_TYPES as readonly string[]).includes(b.type as string) ? (b.type as ColumnType) : "text";
  return { name, type, options: type === "select" || type === "multiselect" ? cleanOptions(b.options) : null };
}

/** The date part (YYYY-MM-DD) of anything date-like, or null. */
export function dateOnly(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim()); if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export const addDays = (from: string, n: number): string => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** One cell, made to fit its column's type. Wrong shapes become empty rather than errors: a sheet should never refuse a keystroke. */
export function cleanCell(type: string, options: unknown, v: unknown): string | number | boolean | string[] | null {
  switch (type) {
    case "number": { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN; return Number.isFinite(n) ? n : null; }
    case "date": return dateOnly(v);
    case "checkbox": return v === true || v === "true" || v === "yes" || v === "1" || v === 1;
    case "rating": { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; }
    case "select": { const o = cleanOptions(options); return typeof v === "string" && o.includes(v) ? v : null; }
    case "multiselect": { const o = cleanOptions(options); const a = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/).map((x) => x.trim()) : []; return [...new Set(a.filter((x): x is string => typeof x === "string" && o.includes(x)))]; }
    case "url": { const s = typeof v === "string" ? v.trim().slice(0, 500) : ""; return /^https?:\/\/\S+$/i.test(s) ? s : null; }
    case "email": { const s = typeof v === "string" ? v.trim().toLowerCase() : ""; return isEmail(s) ? s : null; }
    case "longtext": return typeof v === "string" ? v.slice(0, 4000) : null;
    default: return typeof v === "string" ? v.slice(0, 300) : typeof v === "number" ? String(v) : null;
  }
}

/** "a@x.com, B <b@y.org>; c@z.net" -> the valid, distinct, lower-cased addresses (at most 20), and what was not an address. */
export function parseAddresses(s: unknown): { ok: string[]; bad: string[] } {
  const ok: string[] = [], bad: string[] = [];
  if (typeof s !== "string") return { ok, bad };
  for (const part of s.split(/[,;\n]+/)) {
    const t = part.trim(); if (!t) continue;
    const m = /<([^<>]+)>\s*$/.exec(t); const addr = (m ? m[1] : t).trim().toLowerCase();
    if (isEmail(addr)) { if (!ok.includes(addr) && ok.length < 20) ok.push(addr); } else bad.push(t);
  }
  return { ok, bad };
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";
export interface ContactLike { name: string; email: string; data: Record<string, unknown>; lastSentAt: Date | string | null; sentCount: number }

/** What {{field}} can say for one contact: name, first_name, email, last_sent, sent_count and every custom column by its key. */
export function fieldValues(c: ContactLike, columns: ColumnDef[]): Record<string, string> {
  const v: Record<string, string> = { name: c.name, first_name: firstName(c.name), email: c.email, sent_count: String(c.sentCount), last_sent: c.lastSentAt ? (typeof c.lastSentAt === "string" ? c.lastSentAt : c.lastSentAt.toISOString()).slice(0, 10) : "" };
  for (const col of columns) {
    const x = c.data?.[col.key];
    v[col.key] = Array.isArray(x) ? x.join(", ") : typeof x === "boolean" ? (x ? "yes" : "no") : x === null || x === undefined ? "" : String(x);
  }
  return v;
}

/** {{field}} or {{field|fallback}}. A field with nothing in it and no fallback comes out empty and is reported, so nothing is sent with a hole in it unnoticed. */
export function fillFields(text: string, values: Record<string, string>, mark = false): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([a-z0-9_]+)\s*(?:\|([^{}]*))?\}\}/gi, (_m, k: string, fb?: string) => {
    const val = values[k.toLowerCase()];
    const wrap = (x: string) => (mark ? `\u0001${x}\u0002` : x);
    if (val !== undefined && val.trim() !== "") return wrap(val);
    if (fb !== undefined) return wrap(fb.trim());
    if (!missing.includes(k.toLowerCase())) missing.push(k.toLowerCase());
    return "";
  });
  return { text: out, missing };
}

export const isDue = (followUpAt: Date | string | null, now: Date): boolean => !!followUpAt && new Date(followUpAt).getTime() <= now.getTime();

// ---- CSV
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
}
export interface ImportContact { place: string; lat: number | null; lng: number | null; status: string; deadline: string | null; timezone: string | null; groups: string[]; name: string; email: string; data: Record<string, unknown>; lastSentAt: string | null; sentCount: number; followUpAt: string | null }
export interface ImportPlan { newColumns: { key: string; name: string; type: ColumnType }[]; contacts: ImportContact[]; skipped: number }
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
/** Maps a sheet's header onto the contact sheet: Name, Email, Last sent, Times sent, Follow up are built in; a header that matches a column goes there; any other becomes a new text column. */
export function planImport(header: string[], rows: string[][], columns: ColumnDef[], maxRows = 2000, hints: Record<string, string> = {}): ImportPlan {
  const hintOf = (h: string): ColumnType => { const t = hints[norm(h)]; return (COLUMN_TYPES as readonly string[]).includes(t) ? (t as ColumnType) : "text"; };
  const taken = new Set(columns.map((c) => c.key));
  const newColumns: ImportPlan["newColumns"] = [];
  const map: ({ kind: "name" | "email" | "last" | "count" | "follow" | "groups" | "status" | "deadline" | "timezone" | "place" | "lat" | "lng" } | { kind: "col"; key: string; type: string; options?: unknown } | null)[] = header.map((h) => {
    const n = norm(h);
    if (!n) return null;
    if (n === "name" || n === "contact") return { kind: "name" };
    if (n === "group" || n === "groups") return { kind: "groups" };
    if (n === "email" || n === "e mail" || n === "mail") return { kind: "email" };
    if (n === "last sent" || n === "last contacted") return { kind: "last" };
    if (n === "sent" || n === "times sent" || n === "sent count" || n === "emails sent") return { kind: "count" };
    if (n === "status" || n === "stage") return { kind: "status" };
    if (n === "deadline" || n === "closes" || n === "closing date") return { kind: "deadline" };
    if (n === "timezone" || n === "time zone") return { kind: "timezone" };
    if (n === "place" || n === "location") return { kind: "place" };
    if (n === "latitude" || n === "lat") return { kind: "lat" };
    if (n === "longitude" || n === "lng" || n === "lon" || n === "long") return { kind: "lng" };
    if (n === "follow up" || n === "followup" || n === "follow up date") return { kind: "follow" };
    const hit = columns.find((c) => norm(c.name) === n || c.key === n.replace(/ /g, "_"));
    if (hit) return { kind: "col", key: hit.key, type: hit.type, options: hit.options };
    const already = newColumns.find((c) => norm(c.name) === n);
    if (already) return { kind: "col", key: already.key, type: already.type };
    if (columns.length + newColumns.length >= MAX_COLUMNS) return null;
    const key = slugKey(h, taken); taken.add(key); const type = hintOf(h); newColumns.push({ key, name: h.trim().slice(0, 60), type });
    return { kind: "col", key, type };
  });
  const contacts: ImportContact[] = []; let skipped = 0;
  for (const r of rows.slice(0, maxRows)) {
    const c: ImportContact = { place: "", lat: null, lng: null, status: "", deadline: null, timezone: null, groups: [], name: "", email: "", data: {}, lastSentAt: null, sentCount: 0, followUpAt: null };
    r.forEach((cell, i) => {
      const m = map[i]; if (!m) return;
      const v = (cell ?? "").trim();
      if (m.kind === "name") c.name = v.slice(0, 120);
      else if (m.kind === "email") { const e = parseAddresses(v).ok[0]; if (e) c.email = e; }
      else if (m.kind === "last") c.lastSentAt = dateOnly(v);
      else if (m.kind === "count") c.sentCount = Math.max(0, Math.min(9999, parseInt(v, 10) || 0));
      else if (m.kind === "follow") c.followUpAt = dateOnly(v);
      else if (m.kind === "status") c.status = cleanStatus(v.toLowerCase());
      else if (m.kind === "deadline") c.deadline = dateOnly(v);
      else if (m.kind === "timezone") c.timezone = validZone(v) ? v : null;
      else if (m.kind === "place") c.place = v.slice(0, 160);
      else if (m.kind === "lat") { const n = Number(v.replace(",", ".")); c.lat = Number.isFinite(n) && Math.abs(n) <= 90 ? n : null; }
      else if (m.kind === "lng") { const n = Number(v.replace(",", ".")); c.lng = Number.isFinite(n) && Math.abs(n) <= 180 ? n : null; }
      else if (m.kind === "groups") c.groups = [...new Set(v.split(/[;|,]/).map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
      else if (m.kind === "col" && v !== "") { const x = cleanCell(m.type, m.options, v); if (x !== null && !(Array.isArray(x) && x.length === 0)) c.data[m.key] = x; }
    });
    if (!c.name && !c.email && Object.keys(c.data).length === 0) { skipped++; continue; }
    contacts.push(c);
  }
  return { newColumns, contacts, skipped: skipped + Math.max(0, rows.length - maxRows) };
}

// ---- files that live on this server
import path from "node:path";
import { cleanStatus, validZone } from "./outreachPlus.js";
/** The file on disk behind an /uploads/... address, or null: never outside the uploads folder. */
export function uploadFile(url: string, root: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  let rel: string; try { rel = decodeURIComponent(url.slice("/uploads/".length).split("?")[0]); } catch { return null; }
  const base = path.resolve(root), f = path.resolve(base, rel);
  return f.startsWith(base + path.sep) ? f : null;
}
export const MAX_ATTACH_BYTES = 20 * 1024 * 1024; // mail providers stop at about 25 MB once encoded
export const MAX_RECIPIENTS = 50;
