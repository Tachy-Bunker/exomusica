/** Finding the same call or person twice, and merging them field by field. Pure: the page shows the choices, the server applies the result. */
import { STATUS_ORDER, type CellValue, type Col, type Contact, type Group } from "../components/outreach/types";
import { cellText } from "./outreachSheet";

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "orange.fr", "free.fr", "wanadoo.fr", "laposte.net", "web.de", "t-online.de"]);
const fold = (s: string): string => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const domainOf = (email: string): string => { const d = email.trim().toLowerCase().split("@")[1] ?? ""; return FREE_MAIL.has(d) ? "" : d; };
const hostOf = (u: string): string => { try { const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase(); return FREE_MAIL.has(h) ? "" : h; } catch { return ""; } };

export interface DupGroup { ids: number[]; reasons: string[]; weak: boolean }

/** Contacts that look like one: same address, same name at the same place, same web page. Groups from firm matches come first;
 *  "same organisation" (shared domain, different people) is offered separately as a weak match. */
export function findDuplicates(contacts: Contact[], cols: Col[]): DupGroup[] {
  const urlKeys = cols.filter((c) => c.type === "url").map((c) => c.key);
  const parent = new Map<number, number>(); const why = new Map<number, Set<string>>();
  const find = (x: number): number => { let r = x; while ((parent.get(r) ?? r) !== r) r = parent.get(r) as number; parent.set(x, r); return r; };
  const union = (a: number, b: number, reason: string) => { const ra = find(a), rb = find(b); if (ra !== rb) { parent.set(rb, ra); const s = why.get(ra) ?? new Set(); for (const x of why.get(rb) ?? []) s.add(x); why.set(ra, s); } (why.get(find(a)) ?? why.set(find(a), new Set()).get(find(a)) as Set<string>).add(reason); };
  const bucket = (keyOf: (c: Contact) => string[], reason: string, accept: (a: Contact, b: Contact) => boolean = () => true, strong = true) => {
    const m = new Map<string, Contact[]>();
    for (const c of contacts) for (const k of keyOf(c)) { if (!k) continue; const l = m.get(k) ?? []; l.push(c); m.set(k, l); }
    for (const l of m.values()) for (let i = 1; i < l.length; i++) if (strong ? accept(l[0], l[i]) : accept(l[0], l[i])) union(l[0].id, l[i].id, reason);
  };
  bucket((c) => [c.email.trim().toLowerCase()], "same email address");
  bucket((c) => [fold(c.name).length >= 4 ? fold(c.name) : ""], "same name", (a, b) => !a.email || !b.email || a.email.toLowerCase() === b.email.toLowerCase() || domainOf(a.email) === domainOf(b.email) || !domainOf(a.email) || !domainOf(b.email));
  bucket((c) => urlKeys.map((k) => hostOf(String(c.data[k] ?? "")) ? `${hostOf(String(c.data[k]))}|${new URL(String(c.data[k])).pathname.replace(/\/$/, "")}` : ""), "same web page");
  const strongGroups = new Map<number, number[]>();
  for (const c of contacts) { if (!parent.has(c.id) && ![...parent.values()].includes(c.id)) continue; const r = find(c.id); strongGroups.set(r, [...(strongGroups.get(r) ?? []), c.id]); }
  const out: DupGroup[] = [...strongGroups].filter(([, ids]) => ids.length > 1).map(([r, ids]) => ({ ids: ids.sort((a, b) => a - b), reasons: [...(why.get(r) ?? [])], weak: false }));
  const inStrong = new Set(out.flatMap((g) => g.ids));
  // weak: same organisation (a shared non-webmail domain) among those not already grouped
  const dom = new Map<string, number[]>();
  for (const c of contacts) { if (inStrong.has(c.id)) continue; const d = domainOf(c.email); if (d) dom.set(d, [...(dom.get(d) ?? []), c.id]); }
  for (const [d, ids] of dom) if (ids.length > 1) out.push({ ids: ids.sort((a, b) => a - b), reasons: [`same organisation (${d})`], weak: true });
  return out.sort((a, b) => Number(a.weak) - Number(b.weak) || b.ids.length - a.ids.length || a.ids[0] - b.ids[0]);
}

// ------------------------------------------------------------ merging
export type Strategy = "newest" | "complete" | "combine" | "oldest";
export const STRATEGY_LABEL: Record<Strategy, string> = { newest: "Keep newest", complete: "Keep most complete", combine: "Combine all", oldest: "Keep oldest" };
export type RowKind = "text" | "long" | "date" | "number" | "list" | "status" | "place";
export interface MergeCandidate { id: number; value: CellValue | { place: string; lat: number | null; lng: number | null } }
export interface MergeRow { field: string; label: string; kind: RowKind; candidates: MergeCandidate[]; same: boolean }

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);
const sameVal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** One row per field that has something to decide. `same` rows hold equal values everywhere (no decision needed). */
export function buildMergeRows(list: Contact[], cols: Col[], groups: Group[]): MergeRow[] {
  const rows: MergeRow[] = []; const gname = new Map(groups.map((g) => [g.id, g.name]));
  const add = (field: string, label: string, kind: RowKind, get: (c: Contact) => MergeCandidate["value"]) => {
    const candidates = list.map((c) => ({ id: c.id, value: get(c) })); const filled = candidates.filter((x) => !isEmpty(kind === "place" ? (x.value as { place: string }).place : x.value));
    if (!filled.length) return;
    rows.push({ field, label, kind, candidates, same: filled.length === candidates.length && filled.every((x) => sameVal(x.value, filled[0].value)) });
  };
  add("name", "Name", "text", (c) => c.name); add("email", "Email", "text", (c) => c.email.trim().toLowerCase()); add("status", "Status", "status", (c) => c.status);
  add("deadline", "Deadline", "date", (c) => c.deadline); add("followUpAt", "Follow up", "date", (c) => c.followUpAt); add("lastSentAt", "Last sent", "date", (c) => c.lastSentAt);
  add("sentCount", "Times sent", "number", (c) => c.sentCount); add("timezone", "Time zone", "text", (c) => c.timezone);
  add("place", "Place", "place", (c) => ({ place: c.place, lat: c.lat, lng: c.lng }));
  add("groups", "Groups", "list", (c) => c.groups.map((g) => gname.get(g) ?? "").filter(Boolean).sort());
  for (const col of cols) add(`data:${col.key}`, col.name, col.type === "longtext" ? "long" : col.type === "number" || col.type === "rating" ? "number" : col.type === "multiselect" ? "list" : col.type === "date" ? "date" : "text", (c) => c.data[col.key]);
  return rows;
}

const rank = (s: string): number => { const i = STATUS_ORDER.indexOf(s as never); return i < 0 ? -1 : i; };

/** The value a strategy picks for one row. `order` is the contacts' ids from oldest to newest record. */
export function chooseValue(row: MergeRow, strategy: Strategy, order: number[]): MergeCandidate["value"] {
  const age = (id: number) => order.indexOf(id);
  const filled = row.candidates.filter((x) => !isEmpty(row.kind === "place" ? (x.value as { place: string }).place : x.value));
  if (!filled.length) return row.kind === "place" ? { place: "", lat: null, lng: null } : row.kind === "list" ? [] : row.kind === "number" ? 0 : "";
  const byAge = [...filled].sort((a, b) => age(a.id) - age(b.id)); const newest = byAge[byAge.length - 1], oldest = byAge[0];
  const textLen = (x: MergeCandidate) => (row.kind === "place" ? (x.value as { place: string }).place : cellText(x.value as CellValue)).length;
  switch (row.kind) {
    case "date": { const ds = filled.map((x) => String(x.value)).sort(); return strategy === "oldest" ? (oldest.value as string) : strategy === "newest" ? (newest.value as string) : ds[ds.length - 1]; } // a date: the latest one is what matters for combine/complete
    case "number": { const ns = filled.map((x) => Number(x.value)); return strategy === "combine" ? ns.reduce((a, b) => a + b, 0) : strategy === "oldest" ? Number(oldest.value) : strategy === "newest" ? Number(newest.value) : Math.max(...ns); }
    case "list": { if (strategy === "combine" || strategy === "complete") return [...new Set(filled.flatMap((x) => x.value as string[]))]; return (strategy === "oldest" ? oldest : newest).value; }
    case "status": { if (strategy === "oldest") return oldest.value; if (strategy === "newest") return newest.value; return filled.map((x) => String(x.value)).sort((a, b) => rank(b) - rank(a))[0]; } // furthest along the pipeline
    case "place": { if (strategy === "oldest") return oldest.value; if (strategy === "newest") return newest.value; const withLL = filled.filter((x) => (x.value as { lat: number | null }).lat !== null); return [...(withLL.length ? withLL : filled)].sort((a, b) => textLen(b) - textLen(a))[0].value; }
    case "long": if (strategy === "combine") { const parts = [...new Set(byAge.map((x) => cellText(x.value as CellValue).trim()).filter(Boolean))]; return parts.join("\n\n"); } /* falls through */
    default: {
      if (strategy === "oldest") return oldest.value; if (strategy === "newest") return newest.value;
      if (strategy === "complete") return [...filled].sort((a, b) => textLen(b) - textLen(a) || age(b.id) - age(a.id))[0].value;
      const parts = [...new Set(byAge.map((x) => cellText(x.value as CellValue).trim()).filter(Boolean))]; return row.field === "email" ? newest.value : parts.length === 1 ? parts[0] : parts.join(" / ");
    }
  }
}

export type Choices = Record<string, MergeCandidate["value"]>;
export function applyStrategy(rows: MergeRow[], strategy: Strategy, order: number[]): Choices {
  return Object.fromEntries(rows.map((r) => [r.field, chooseValue(r, strategy, order)]));
}

/** The request body for the server: choices turned back into fields, group names back into ids. */
export function toMergeBody(keepId: number, ids: number[], choices: Choices, groups: Group[]) {
  const gid = new Map(groups.map((g) => [g.name, g.id])); const data: Record<string, unknown> = {}; const v: Record<string, unknown> = { data };
  for (const [field, val] of Object.entries(choices)) {
    if (field.startsWith("data:")) data[field.slice(5)] = val;
    else if (field === "place") { const p = val as { place: string; lat: number | null; lng: number | null }; v.place = p.place; v.lat = p.lat; v.lng = p.lng; }
    else if (field === "groups") v.groups = (val as string[]).flatMap((n) => (gid.has(n) ? [gid.get(n) as number] : []));
    else v[field] = val === "" ? null : val;
  }
  if ("name" in v) v.name = v.name ?? ""; if ("email" in v) v.email = v.email ?? "";
  return { keepId, ids, values: v };
}
/** The record that most deserves to survive: the one with the most mail, then the oldest. */
export const pickKeeper = (list: Contact[]): number => [...list].sort((a, b) => b.sentCount - a.sentCount || a.id - b.id)[0].id;
