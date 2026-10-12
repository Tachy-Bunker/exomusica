/** What fits your work, what it costs, and what looks like the calls you were accepted to. Pure. */
import type { Col, Contact, FitProfile, Group } from "../components/outreach/types";
import { daysBetween, cellText } from "./outreachSheet";
import { haversineKm } from "./geo";

/** "€25", "25 EUR", "$ 12.50", "free" -> an amount (0 for free), or null when there is none. */
export function parseFee(v: unknown): number | null {
  const t = cellText(v as never).trim().toLowerCase(); if (!t) return null;
  if (/\b(free|gratuit|none|no fee|sans frais)\b/.test(t)) return 0;
  const m = /(\d{1,6}(?:[.,]\d{1,2})?)/.exec(t.replace(/(\d)[\s']((?=\d{3}\b))/g, "$1")); return m ? Number(m[1].replace(",", ".")) : null;
}
const feeCol = (cols: Col[]): Col | undefined => cols.find((c) => /^fee|^frais|^cost/i.test(c.name)) ?? cols.find((c) => c.key === "fee");
export const feeOf = (c: Contact, cols: Col[]): number | null => { const f = feeCol(cols); return f ? parseFee(c.data[f.key]) : null; };

const textOf = (c: Contact, cols: Col[]): string => [c.name, c.place, ...cols.map((x) => cellText(c.data[x.key]))].join(" ").toLowerCase();

export interface Fit { score: number; why: string[] }
/** 0–100. Keywords you care about add, words you avoid subtract, a fee over your limit subtracts, a deadline with no room (or past) subtracts,
 *  a place in your regions adds. An empty profile scores 50 for everybody so the column stays neutral. */
export function fitScore(c: Contact, cols: Col[], p: Partial<FitProfile>, today: string): Fit {
  const why: string[] = []; let s = 50; const t = textOf(c, cols);
  const kw = (p.keywords ?? []).filter((k) => t.includes(k)), av = (p.avoid ?? []).filter((k) => t.includes(k));
  if (kw.length) { s += Math.min(30, kw.length * 12); why.push(`mentions ${kw.slice(0, 3).join(", ")}`); }
  if (av.length) { s -= Math.min(40, av.length * 20); why.push(`mentions ${av.slice(0, 2).join(", ")} (avoid)`); }
  const rg = (p.regions ?? []).filter((r) => t.includes(r)); if (rg.length) { s += 10; why.push(`in ${rg[0]}`); }
  const fee = feeOf(c, cols);
  if (fee !== null && p.maxFee != null) { if (fee === 0) { s += 6; why.push("free to enter"); } else if (fee > p.maxFee) { s -= 20; why.push(`fee ${fee} is over your limit`); } }
  if (c.deadline) { const d = daysBetween(today, c.deadline); if (d < 0) { s -= 50; why.push("closed"); } else if (d < 3) { s -= 12; why.push("closes within 3 days"); } else if (d >= 7 && d <= 60) s += 5; }
  if (p.homeLat != null && p.homeLng != null && c.lat !== null && c.lng !== null && (p.regions ?? []).length === 0) { const km = haversineKm({ lat: p.homeLat, lng: p.homeLng }, { lat: c.lat, lng: c.lng }); if (km < 1500) { s += 6; why.push("close to home"); } }
  return { score: Math.max(0, Math.min(100, Math.round(s))), why };
}

const STOP = new Set(["the", "and", "for", "with", "open", "call", "festival", "submission", "submissions", "from", "that", "this", "your", "des", "les", "pour", "avec", "une", "dans", "link", "fee", "free"]);
const tokens = (c: Contact, cols: Col[], groups: Group[]): Set<string> => {
  const out = new Set<string>(); for (const g of c.groups) { const n = groups.find((x) => x.id === g)?.name; if (n) out.add(`group:${n.toLowerCase()}`); }
  for (const w of textOf(c, cols).split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  if (c.timezone) out.add(`tz:${c.timezone}`);
  return out;
};
/** Rows that share the most with the calls you were accepted to (not yet written to, not closed). */
export function lookAlikes(contacts: Contact[], cols: Col[], groups: Group[], today: string, limit = 8): { contact: Contact; score: number; shared: string[] }[] {
  const winners = contacts.filter((c) => c.status === "accepted"); if (!winners.length) return [];
  const freq = new Map<string, number>(); for (const w of winners) for (const t of tokens(w, cols, groups)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const common = [...freq].filter(([, n]) => n >= Math.max(1, Math.ceil(winners.length / 2))).map(([t]) => t);
  const out = contacts.filter((c) => (c.status === "" || c.status === "lead") && c.sentCount === 0 && !c.doNotContact && !(c.deadline && c.deadline < today)).map((c) => { const t = tokens(c, cols, groups); const shared = common.filter((x) => t.has(x)); return { contact: c, score: shared.length, shared: shared.slice(0, 4).map((x) => x.replace(/^group:|^tz:/, "")) }; });
  return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.contact.id - b.contact.id).slice(0, limit);
}

/** Fees spent this year (calls you wrote to) against the yearly budget. */
export function feeBudget(contacts: Contact[], cols: Col[], year: string, budget: number | null): { spent: number; paidCalls: number; left: number | null; over: boolean } {
  let spent = 0, n = 0;
  for (const c of contacts) { if (c.sentCount < 1 || !c.lastSentAt || !c.lastSentAt.startsWith(year)) continue; const f = feeOf(c, cols); if (f && f > 0) { spent += f; n++; } }
  return { spent: Math.round(spent * 100) / 100, paidCalls: n, left: budget == null ? null : Math.round((budget - spent) * 100) / 100, over: budget != null && spent > budget };
}
