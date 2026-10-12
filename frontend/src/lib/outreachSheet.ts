/** Pure helpers for the Outreach contact sheet: filtering, sorting, due dates, export. No DOM, so they test alone. */
import { STATUS_LABEL, STATUS_ORDER, type CellValue, type Col, type Contact, type Group } from "../components/outreach/types";

export const BUILTIN = ["name", "email", "lastSentAt", "sentCount", "followUpAt"] as const;

export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "";
  return String(v);
}

/** Days from `today` to `date` (negative = in the past). Both are YYYY-MM-DD. */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
export const isDue = (c: Pick<Contact, "followUpAt">, today: string): boolean => !!c.followUpAt && c.followUpAt <= today;

/** "today", "3 days ago", "in 2 weeks" — short, for a table cell. */
export function relDay(today: string, date: string | null): string {
  if (!date) return "";
  const d = daysBetween(today, date), a = Math.abs(d);
  if (d === 0) return "today";
  const span = a < 14 ? `${a} day${a === 1 ? "" : "s"}` : a < 60 ? `${Math.round(a / 7)} weeks` : a < 700 ? `${Math.round(a / 30)} months` : `${Math.round(a / 365)} years`;
  return d < 0 ? `${span} ago` : `in ${span}`;
}

export interface SheetFilter { q: string; due: boolean; never: boolean; group?: number | "none" | null; status?: string | null }
export function filterContacts(list: Contact[], cols: Col[], f: SheetFilter, today: string): Contact[] {
  const q = f.q.trim().toLowerCase();
  return list.filter((c) => {
    if (f.due && !isDue(c, today)) return false;
    if (f.never && c.sentCount > 0) return false;
    if (f.status && (f.status === "none" ? c.status !== "" : c.status !== f.status)) return false;
    if (f.group === "none" ? c.groups.length > 0 : typeof f.group === "number" && !c.groups.includes(f.group)) return false;
    if (!q) return true;
    if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) return true;
    return cols.some((col) => cellText(c.data[col.key]).toLowerCase().includes(q));
  });
}

export function sortContacts(list: Contact[], cols: Col[], key: string | null, dir: 1 | -1, groups: Group[] = [], virt: Record<string, (c: Contact) => number | string | null> = {}): Contact[] {
  if (!key) return list;
  const gname = new Map(groups.map((g) => [g.id, g.name.toLowerCase()]));
  const col = cols.find((c) => c.key === key);
  const get = (c: Contact): string | number | null => {
    if (virt[key]) return virt[key](c);
    if (key === "place") return c.place.toLowerCase() || null;
    if (key === "name" || key === "email") return c[key].toLowerCase() || null;
    if (key === "lastSentAt" || key === "followUpAt" || key === "reopensAt") return c[key] || null;
    if (key === "sentCount") return c.sentCount;
    if (key === "status") { const i = STATUS_ORDER.indexOf(c.status as never); return i < 0 ? null : i; }
    if (key === "deadline") return c.deadline || null;
    if (key === "timezone") return c.timezone.toLowerCase() || null;
    if (key === "groups") return c.groups.map((g) => gname.get(g) ?? "").filter(Boolean).sort().join(", ") || null;
    const v = c.data[key];
    if (v === undefined || v === null || v === "" || v === false) return null;
    if (col && (col.type === "number" || col.type === "rating")) return Number(v);
    if (Array.isArray(v)) return v.join(", ").toLowerCase();
    return typeof v === "string" ? v.toLowerCase() : Number(v);
  };
  return list.map((c, i) => ({ c, i, v: get(c) })).sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1; // empty cells always sink
    return (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * dir || a.i - b.i;
  }).map((x) => x.c);
}

export function exportRows(list: Contact[], cols: Col[], includeHidden = true, groups: Group[] = []): string[][] {
  const shown = cols.filter((c) => includeHidden || !c.hidden), gname = new Map(groups.map((g) => [g.id, g.name]));
  const head = ["Name", "Email", "Groups", "Status", "Deadline", ...shown.map((c) => c.name), "Last sent", "Times sent", "Follow up", "Timezone", "Place", "Latitude", "Longitude"];
  return [head, ...list.map((c) => [c.name, c.email, c.groups.map((g) => gname.get(g) ?? "").filter(Boolean).join("; "), STATUS_LABEL[c.status] === "—" ? "" : STATUS_LABEL[c.status] ?? c.status, c.deadline ?? "", ...shown.map((col) => cellText(c.data[col.key])), c.lastSentAt ?? "", String(c.sentCount), c.followUpAt ?? "", c.timezone, c.place, c.lat === null ? "" : String(c.lat), c.lng === null ? "" : String(c.lng)])];
}
/** Spreadsheet-safe CSV: a leading = + - @ would run as a formula when opened, so those cells get a quote mark in front. */
export function toCsv(rows: string[][], guard = true): string {
  const cell = (s: string) => { const t = guard && /^[=+\-@]/.test(s) && !/^[+-]?\d[\d.,]*$/.test(s) ? `'${s}` : s; return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function toJson(list: Contact[], cols: Col[], groups: Group[] = []): string {
  const gname = new Map(groups.map((g) => [g.id, g.name]));
  return JSON.stringify(list.map((c) => ({ name: c.name, email: c.email, groups: c.groups.map((g) => gname.get(g)).filter(Boolean), status: c.status, deadline: c.deadline, timezone: c.timezone || null, ...Object.fromEntries(cols.map((col) => [col.name, c.data[col.key] ?? null])), lastSentAt: c.lastSentAt, timesSent: c.sentCount, followUpAt: c.followUpAt, place: c.place || null, latitude: c.lat, longitude: c.lng })), null, 2);
}

/** What {{field}} names exist for the composer's insert menu. */
export function mergeFields(cols: Col[]): { key: string; label: string }[] {
  return [
    { key: "name", label: "Name" }, { key: "first_name", label: "First name" }, { key: "email", label: "Email" },
    { key: "last_sent", label: "Last sent" }, { key: "sent_count", label: "Times sent" },
    ...cols.map((c) => ({ key: c.key, label: c.name })),
  ];
}

export const parseAddressList = (s: string): string[] => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
