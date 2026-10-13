// Pure helpers behind Outreach's second round: block variants, marked merge fields, zoned send times, and reading an open-call page.
import net from "node:net";

// ------------------------------------------------------------ block variants
export interface BlockRef { id: number; kind: string; title: string; body: string }
export interface VariantRule { kind: string; group: number | null; blockId: number }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "Short bio · fr" / "Short bio (fr)" / "Short bio [fr]": a block written for one language. */
export function blockLang(title: string): { base: string; lang: string } {
  const m = /^(.*?)\s*(?:[·|-]\s*|\(|\[)([a-z]{2})\s*[)\]]?\s*$/i.exec(title.trim());
  return m && m[1] ? { base: m[1].trim().toLowerCase(), lang: m[2].toLowerCase() } : { base: title.trim().toLowerCase(), lang: "" };
}
/** The same block in the person's language, when one exists (Language column "French"/"fr"/"fr-CA" -> "· fr"). */
export function twinFor(chosen: BlockRef, ofKind: BlockRef[], lang: string): BlockRef {
  const want = langCode(lang); if (!want) return chosen;
  const base = blockLang(chosen.title).base;
  return ofKind.find((b) => { const x = blockLang(b.title); return x.base === base && x.lang === want; }) ?? chosen;
}
const LANGS: Record<string, string> = { english: "en", anglais: "en", french: "fr", francais: "fr", "français": "fr", german: "de", deutsch: "de", allemand: "de", spanish: "es", espanol: "es", "español": "es", espagnol: "es", italian: "it", italiano: "it", italien: "it", dutch: "nl", portuguese: "pt" };
export const langCode = (v: string): string => { const t = v.trim().toLowerCase(); if (!t) return ""; if (LANGS[t]) return LANGS[t]; const m = /^([a-z]{2})(?:[-_][a-z]{2})?$/.exec(t); return m ? m[1] : ""; };

/** {{block:Short bio}} -> the block chosen for this person: a rule for one of their groups, else the rule without a group, else the first block of that kind. Unknown kinds stay as written so the preview shows the gap. */
export function expandBlocks(md: string, rules: VariantRule[], blocks: BlockRef[], groups: number[], lang = ""): { text: string; used: { kind: string; blockId: number }[]; unresolved: string[] } {
  const used: { kind: string; blockId: number }[] = [], unresolved: string[] = [];
  const text = md.replace(/\{\{\s*block\s*:\s*([^{}|]+?)\s*\}\}/gi, (whole, kind: string) => {
    const k = norm(kind), ofKind = blocks.filter((b) => norm(b.kind) === k);
    const mine = rules.filter((r) => norm(r.kind) === k);
    const pick = mine.find((r) => r.group !== null && groups.includes(r.group)) ?? mine.find((r) => r.group === null);
    const chosen = (pick && ofKind.find((b) => b.id === pick.blockId)) ?? ofKind[0];
    const block = chosen && lang ? twinFor(chosen, ofKind, lang) : chosen;
    if (!block) { if (!unresolved.includes(kind.trim())) unresolved.push(kind.trim()); return whole; }
    used.push({ kind: block.kind, blockId: block.id });
    return block.body.trim();
  });
  return { text, used, unresolved };
}

// ------------------------------------------------------------ marked merge fields (preview only)
export const MARK_OPEN = "\u0001", MARK_CLOSE = "\u0002";
/** Turns the markers around merged values into a highlight in the preview HTML (markers inside tags, like a link address, are dropped). */
export function highlightMarks(html: string): string {
  const clean = html.replace(/<[^>]*>/g, (t) => t.replace(/[\u0001\u0002]/g, ""));
  return clean.replace(/\u0001/g, '<span style="background:#ffe08a;border-radius:2px">').replace(/\u0002/g, "</span>");
}
export const stripMarks = (s: string): string => s.replace(/[\u0001\u0002]/g, "");

// ------------------------------------------------------------ time zones
function offsetMs(at: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at / 1000) * 1000;
}
export const validZone = (tz: unknown): tz is string => { if (typeof tz !== "string" || !tz || tz.length > 60) return false; try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
/** 2026-11-03 + 10:00 in Europe/Paris -> the instant it is that o'clock there. */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(date), t = /^(\d\d):(\d\d)$/.exec(time); if (!d || !t || !validZone(tz)) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let at = guess - offsetMs(guess, tz); at = guess - offsetMs(at, tz); // twice: the first guess can sit on the other side of a clock change
  return new Date(at);
}
/** Saturday and Sunday move to Monday. */
export function nextWeekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`), w = d.getUTCDay();
  if (w === 6) d.setUTCDate(d.getUTCDate() + 2); else if (w === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ reading an open call
const MONTHS: Record<string, number> = { jan: 1, january: 1, janvier: 1, feb: 2, february: 2, février: 2, fevrier: 2, mar: 3, march: 3, mars: 3, apr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, june: 6, juin: 6, jul: 7, july: 7, juillet: 7, aug: 8, august: 8, août: 8, aout: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10, nov: 11, november: 11, novembre: 11, dec: 12, december: 12, décembre: 12, decembre: 12 };
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string | null => { if (m < 1 || m > 12 || d < 1 || d > 31) return null; const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null; };
export function findDates(text: string): { iso: string; at: number }[] {
  const out: { iso: string; at: number }[] = [];
  const add = (v: string | null, at: number) => { if (v) out.push({ iso: v, at }); };
  for (const m of text.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) add(iso(+m[1], +m[2], +m[3]), m.index ?? 0);
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er)?\\s+(?:of\\s+)?(${MON})\\.?,?\\s+(20\\d\\d)\\b`, "gi"))) add(iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]), m.index ?? 0);
  for (const m of text.matchAll(new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b`, "gi"))) add(iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), m.index ?? 0);
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d\d)\b/g)) add(iso(+m[3], +m[2], +m[1]), m.index ?? 0); // day first, as in most of the world
  return out.sort((a, b) => a.at - b.at);
}
const KEY = /((?:submit|apply|send|enter|sign\s?up)[^.\n]{0,40}?\bby|dead\s?line|closes?|closing|due(?:\s+date)?|submit(?:ted)?\s+by|submissions?\s+(?:until|close)|apply\s+(?:by|before)|before|no\s+later\s+than|applications?\s+(?:until|close)|until|last\s+day|date\s+limite|clôture|cloture|avant\s+le|jusqu['’]au)/gi;
export function findDeadline(text: string, today: string): string | null {
  const dates = findDates(text); if (!dates.length) return null;
  const near: string[] = [];
  for (const k of text.matchAll(KEY)) { const from = (k.index ?? 0), to = from + 90; for (const d of dates) if (d.at >= from - 5 && d.at <= to) near.push(d.iso); }
  const future = [...new Set(near)].filter((d) => d >= today).sort();
  return future[0] ?? null; // a date with no deadline word near it is not a deadline; better empty than wrong
}
export function findFee(text: string): string | null {
  if (/\b(?:fees?|entry|submission)\s*[:=-]\s*(?:free|none|no|nil|0)\b/i.test(text)) return "free";
  if (/\b(no\s+(?:entry\s+|submission\s+)?fees?|free\s+(?:to\s+)?(?:submit|entry|apply)|gratuit|sans\s+frais)\b/i.test(text)) return "free";
  const m = /(?:fees?|cost|frais|tarif)[^.\n]{0,60}?((?:[€$£]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?(?:€|eur|euros?|usd|\$|£|gbp)))/i.exec(text);
  return m ? m[1].replace(/\s+/g, " ").replace(/[.,]+$/, "").trim() : null;
}
export function findEmails(text: string): string[] {
  const t = text.replace(/\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*/gi, "@").replace(/\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*/gi, ".");
  const found = [...t.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi)].map((m) => m[0].toLowerCase().replace(/\.+$/, ""));
  return [...new Set(found)].filter((e) => !/(^|[._-])(no-?reply|donotreply)@|@(example|domain|sentry)\.|\.(png|jpe?g|gif|webp|svg)$/.test(e)).slice(0, 8);
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Math.min(+n, 0x10ffff)));
export function htmlToText(html: string): string {
  return decode(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export interface Opportunity { title: string; emails: string[]; deadline: string | null; fee: string | null; url: string | null }
export function readOpportunity(input: { html?: string; text?: string; url?: string | null }, today: string): Opportunity {
  const html = input.html ?? "";
  const meta = (p: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, "i").exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, "i").exec(html)?.[1];
  const text = input.text ?? htmlToText(html);
  const mailtos = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const title = decode(meta("og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? text.split("\n").find((l) => l.trim()) ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return { title, emails: findEmails(`${mailtos.join(" ")} ${text}`), deadline: findDeadline(text, today), fee: findFee(text), url: input.url ?? null };
}

// ------------------------------------------------------------ keeping the page fetch away from private networks
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd")) return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l); if (mapped) return isPublicAddress(mapped[1]);
    return true;
  }
  return false;
}

// ------------------------------------------------------------ pipeline and results
export const STATUSES = ["lead", "contacted", "replied", "accepted", "declined", "ghosted"] as const;
export const cleanStatus = (v: unknown): string => (typeof v === "string" && (STATUSES as readonly string[]).includes(v) ? v : "");
/** A reply, an acceptance or a refusal ends the waiting: no more follow-up reminder. */
export const endsWaiting = (status: string): boolean => status === "replied" || status === "accepted" || status === "declined";

export interface StatContact { id: number; status: string; repliedAt: string | null; sentCount: number; groups: number[]; timezone?: string | null; declineReason?: string | null }
export interface StatSend { contactId: number | null; templateName: string | null; blocksUsed: { blockId: number }[] | null; sentAt: Date | string; variant?: string | null }
export interface StatRow { name: string; people: number; replied: number; accepted: number; rate: number }
const gotReply = (c: StatContact): boolean => !!c.repliedAt || c.status === "replied" || c.status === "accepted" || c.status === "declined";
const row = (name: string, cs: StatContact[]): StatRow => { const people = cs.length, replied = cs.filter(gotReply).length; return { name, people, replied, accepted: cs.filter((c) => c.status === "accepted").length, rate: people ? Math.round((replied / people) * 100) : 0 }; };
export function computeStats(contacts: StatContact[], sends: StatSend[], groups: { id: number; name: string }[], blocks: { id: number; title: string; kind: string }[]) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const people = (ids: Set<number>) => [...ids].map((i) => byId.get(i)).filter((c): c is StatContact => !!c);
  const statuses: Record<string, number> = {}; for (const c of contacts) statuses[c.status || "none"] = (statuses[c.status || "none"] ?? 0) + 1;
  const tpl = new Map<string, Set<number>>(), blk = new Map<number, Set<number>>(); const wd = Array.from({ length: 7 }, () => ({ sent: 0, replied: 0 }));
  for (const s of sends) {
    if (s.contactId === null || !byId.has(s.contactId)) continue;
    if (s.templateName) { if (!tpl.has(s.templateName)) tpl.set(s.templateName, new Set()); tpl.get(s.templateName)!.add(s.contactId); }
    for (const b of s.blocksUsed ?? []) { if (!blk.has(b.blockId)) blk.set(b.blockId, new Set()); blk.get(b.blockId)!.add(s.contactId); }
    const d = new Date(s.sentAt).getUTCDay(); wd[d].sent++; if (gotReply(byId.get(s.contactId)!)) wd[d].replied++;
  }
  return {
    statuses,
    groups: groups.map((g) => row(g.name, contacts.filter((c) => c.groups.includes(g.id) && c.sentCount > 0))).filter((r) => r.people > 0),
    templates: [...tpl].map(([n, ids]) => row(n, people(ids))),
    blocks: [...blk].map(([id, ids]) => { const b = blocks.find((x) => x.id === id); return row(b ? `${b.kind}: ${b.title}` : `block #${id}`, people(ids)); }).sort((a, b) => b.people - a.people),
    weekdays: wd,
    overall: row("All", contacts.filter((c) => c.sentCount > 0)),
    variants: (["A", "B"] as const).map((v) => row(`Subject ${v}`, people(new Set(sends.filter((x) => x.variant === v && x.contactId !== null).map((x) => x.contactId as number))))).filter((r) => r.people > 0),
    ...learn(contacts, sends, groups),
  };
}

const hourIn = (at: Date, tz: string | null | undefined): number => {
  if (tz && validZone(tz)) { try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at)); } catch { /* fall through */ } }
  return at.getUTCHours();
};
const median = (xs: number[]): number => { const a = [...xs].sort((p, q) => p - q); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0; };
const MIN_FOR_HOURS = 30;

/** What your own history says: which hour gets answers, how long answers take, why you get declined. */
export function learn(contacts: StatContact[], sends: StatSend[], groups: { id: number; name: string }[]) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const sorted = sends.filter((x) => x.contactId !== null && byId.has(x.contactId as number)).map((x) => ({ id: x.contactId as number, at: new Date(x.sentAt) })).sort((a, b) => a.at.getTime() - b.at.getTime());
  const lastBefore = new Map<number, Date>(); // the mail that was answered: the latest one sent on or before the reply date
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, replied: 0 }));
  for (const x of sorted) { const c = byId.get(x.id) as StatContact; hours[hourIn(x.at, c.timezone)].sent++; }
  const days: Record<number, number> = {};
  for (const c of contacts) {
    if (!c.repliedAt) continue; const end = Date.parse(`${c.repliedAt}T23:59:59Z`);
    const mine = sorted.filter((x) => x.id === c.id && x.at.getTime() <= end); const last = mine[mine.length - 1]; if (!last) continue;
    lastBefore.set(c.id, last.at); hours[hourIn(last.at, c.timezone)].replied++;
    days[c.id] = Math.max(0, Math.round((Date.parse(`${c.repliedAt}T00:00:00Z`) - Date.parse(`${last.at.toISOString().slice(0, 10)}T00:00:00Z`)) / 86400_000));
  }
  const all = Object.values(days);
  const answers = groups.map((g) => { const d = contacts.filter((c) => c.groups.includes(g.id) && days[c.id] !== undefined).map((c) => days[c.id]); return { name: g.name, n: d.length, median: median(d) }; }).filter((r) => r.n > 0);
  const p75 = all.length ? [...all].sort((a, b) => a - b)[Math.min(all.length - 1, Math.floor(all.length * 0.75))] : 0;
  const quietAfter = all.length >= 5 ? Math.max(14, Math.min(90, Math.round(p75 * 1.5) + 7)) : 45;
  const best = sorted.length >= MIN_FOR_HOURS ? hours.filter((h) => h.sent >= 3).map((h) => ({ ...h, rate: h.replied / h.sent })).sort((a, b) => b.rate - a.rate || b.sent - a.sent).slice(0, 3).map((h) => h.hour) : [];
  const reasonCount = new Map<string, number>();
  for (const c of contacts) if (c.status === "declined" && c.declineReason) { const k = c.declineReason.trim().toLowerCase(); reasonCount.set(k, (reasonCount.get(k) ?? 0) + 1); }
  const reasons = [...reasonCount].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n).slice(0, 20);
  return { hours, bestHours: best, answers, answerDays: { n: all.length, median: median(all) }, quietAfter, reasons, totalSends: sorted.length };
}
