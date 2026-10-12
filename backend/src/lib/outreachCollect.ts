/** Collecting: forms, newsletters, feeds, people on a team page. Pure functions over text, so all of it is tested without a network. */
import { XMLParser } from "fast-xml-parser";
import { findDeadline, findEmails, findFee, htmlToText } from "./outreachPlus.js";

// ------------------------------------------------------------ forms
export interface FormField { label: string; type: string; required: boolean; options: string[]; help?: string }
export interface FormInfo { kind: "google" | "html" | "unknown"; title: string; description: string; fields: FormField[] }

const GTYPE: Record<number, string> = { 0: "short text", 1: "long text", 2: "choice", 3: "dropdown", 4: "checkboxes", 5: "scale", 7: "grid", 9: "date", 10: "time", 13: "file upload" };

/** The JSON array Google Forms embeds in its public page (`FB_PUBLIC_LOAD_DATA_ = [...]`), cut out by counting brackets. */
function googleData(html: string): unknown[] | null {
  const at = html.indexOf("FB_PUBLIC_LOAD_DATA_"); if (at < 0) return null;
  const start = html.indexOf("[", at); if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "[") depth++; else if (c === "]" && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)) as unknown[]; } catch { return null; } }
  }
  return null;
}

export function parseGoogleForm(html: string): FormInfo | null {
  const d = googleData(html); if (!d) return null;
  const body = d[1] as unknown[] | undefined; if (!Array.isArray(body)) return null;
  const items = (Array.isArray(body[1]) ? body[1] : []) as unknown[][];
  const fields: FormField[] = [];
  for (const it of items) {
    if (!Array.isArray(it)) continue; const label = typeof it[1] === "string" ? it[1].trim() : "", type = Number(it[3]);
    const q = Array.isArray(it[4]) ? (it[4][0] as unknown[]) : null;
    if (!label || !q || type === 6 || type === 8) continue; // 6 = image/title block, 8 = section break
    const opts = Array.isArray(q[1]) ? (q[1] as unknown[][]).flatMap((o) => (Array.isArray(o) && typeof o[0] === "string" && o[0] ? [o[0]] : [])) : [];
    fields.push({ label, type: GTYPE[type] ?? "text", required: q[2] === 1, options: opts.slice(0, 30), help: typeof it[2] === "string" && it[2].trim() ? it[2].trim().slice(0, 300) : undefined });
  }
  return { kind: "google", title: typeof d[3] === "string" ? d[3] : "", description: typeof body[0] === "string" ? body[0] : "", fields: fields.slice(0, 80) };
}

/** Any other web form: its labelled inputs. JavaScript-built forms (Typeform and the like) show up with no fields: only the page's title and text are saved. */
export function parseHtmlForm(html: string): FormInfo {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  const labels = new Map<string, string>(); for (const l of html.matchAll(/<label[^>]*\sfor=(?:["']([^"']+)["']|([^\s>"']+))[^>]*>([\s\S]*?)<\/label>/gi)) labels.set(l[1] ?? l[2], htmlToText(l[3]).trim());
  let best: FormField[] = [];
  for (const f of forms) {
    const fields: FormField[] = [];
    for (const m of f.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const attrs = m[2], get = (n: string) => { const m2 = new RegExp(`\\b${n}=(?:["']([^"']*)["']|([^\\s>"']+))`, "i").exec(attrs); return m2 ? (m2[1] ?? m2[2] ?? "") : ""; };
      const type = (get("type") || (m[1] === "select" ? "select" : m[1] === "textarea" ? "long text" : "text")).toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "password"].includes(type)) continue;
      const id = get("id"), label = (id && labels.get(id)) || get("aria-label") || get("placeholder") || get("name"); if (!label) continue;
      const name = get("name"); if (/^(q|s|search|query)$/i.test(name) && forms.length >= 1 && f.match(/<input/gi)?.length === 1) continue;
      let options: string[] = []; if (m[1] === "select") { const after = f.slice((m.index ?? 0)); const block = /<select[\s\S]*?<\/select>/i.exec(after)?.[0] ?? ""; options = [...block.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => htmlToText(o[1]).trim()).filter(Boolean).slice(0, 30); }
      if (!fields.some((x) => x.label === label)) fields.push({ label: label.slice(0, 160), type: type === "textarea" ? "long text" : type, required: /\brequired\b/i.test(attrs), options });
    }
    if (fields.length > best.length) best = fields;
  }
  return { kind: best.length ? "html" : "unknown", title, description: /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? "", fields: best.slice(0, 80) };
}

export const parseForm = (html: string): FormInfo => parseGoogleForm(html) ?? parseHtmlForm(html);
export const isGoogleFormUrl = (url: string): boolean => /^https?:\/\/(docs\.google\.com\/forms|forms\.gle)\//i.test(url);

/** The questions as plain lines to keep in one cell. */
export function formQuestionsText(info: FormInfo): string {
  return info.fields.map((f, i) => `${i + 1}. ${f.label}${f.required ? " *" : ""} (${f.type}${f.options.length ? `: ${f.options.slice(0, 8).join(" / ")}` : ""})`).join("\n");
}

// ------------------------------------------------------------ newsletters
export interface FoundCall { title: string; url: string; summary: string; deadline: string | null; fee: string | null; emails: string[]; key: string }
const CALLWORD = /\b(open call|call for|calls? for|submissions?|apply|application|deadline|residen|commission|appel|candidature|festival|submit|proposals?|prize|award|grant)\b/i;

/** One pasted newsletter -> every call in it: a paragraph that has a link or a deadline and talks about applying. */
export function splitNewsletter(text: string, today: string): FoundCall[] {
  const clean = text.replace(/\r/g, "").replace(/ /g, " ");
  const paras = clean.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const out: FoundCall[] = []; const seen = new Set<string>();
  for (let i = 0; i < paras.length; i++) {
    // a heading line followed by its paragraph belongs together
    let p = paras[i]; if (p.length < 60 && !/https?:/.test(p) && paras[i + 1] && paras[i + 1].length >= 60 && !paras[i + 1].includes("\n") && !/^[-*•]/.test(paras[i + 1])) { p = `${p}\n${paras[i + 1]}`; i++; }
    const urls = [...p.matchAll(/https?:\/\/[^\s<>)\]"']+/g)].map((m) => m[0].replace(/[.,;]+$/, ""));
    const deadline = findDeadline(p, today); const call = CALLWORD.test(p);
    if (!call || (!urls.length && !deadline)) continue;
    const first = p.split("\n").map((l) => l.replace(/^[\s\-*•#>\d.)]+/, "").replace(/https?:\/\/\S+/g, "").replace(/[*_`]/g, "").trim()).find((l) => l.length >= 4) ?? urls[0] ?? "Open call";
    const title = first.replace(/\s+/g, " ").slice(0, 110);
    const key = (urls[0] ?? title).toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, ""); if (seen.has(key)) continue; seen.add(key);
    out.push({ title, url: urls[0] ?? "", summary: p.replace(/\s+/g, " ").slice(0, 400), deadline, fee: findFee(p), emails: findEmails(p), key });
  }
  return out.slice(0, 60);
}

// ------------------------------------------------------------ feeds
export interface FeedItem { title: string; link: string; summary: string; date: string | null }
const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>)["#text"] ?? "") : typeof x === "number" ? String(x) : "");

export function parseFeed(xml: string): { title: string; items: FeedItem[] } {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", processEntities: true, htmlEntities: true, parseTagValue: false });
  let o: Record<string, unknown>; try { o = p.parse(xml) as Record<string, unknown>; } catch { return { title: "", items: [] }; }
  const rss = (o.rss as { channel?: Record<string, unknown> } | undefined)?.channel, atom = o.feed as Record<string, unknown> | undefined;
  const items: FeedItem[] = [];
  if (rss) for (const it of arr(rss.item as Record<string, unknown>[] | Record<string, unknown>)) items.push({ title: htmlToText(txt(it.title)).trim(), link: txt(it.link).trim(), summary: htmlToText(txt(it.description) || txt(it["content:encoded"])).slice(0, 600), date: txt(it.pubDate) || null });
  else if (atom) for (const it of arr(atom.entry as Record<string, unknown>[] | Record<string, unknown>)) { const links = arr(it.link as Record<string, string>[] | Record<string, string>); const href = (links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0])?.["@href"] ?? ""; items.push({ title: htmlToText(txt(it.title)).trim(), link: href, summary: htmlToText(txt(it.summary) || txt(it.content)).slice(0, 600), date: txt(it.updated) || txt(it.published) || null }); }
  return { title: txt(rss?.title ?? atom?.title).trim().slice(0, 120), items: items.filter((i) => i.title || i.link).slice(0, 60) };
}
export const looksLikeCall = (title: string, summary: string): boolean => CALLWORD.test(`${title} ${summary}`);
export const feedLead = (it: FeedItem, today: string): FoundCall => { const text = `${it.title}\n${it.summary}`; return { title: it.title.slice(0, 120), url: it.link, summary: it.summary.slice(0, 400), deadline: findDeadline(text, today), fee: findFee(text), emails: findEmails(text), key: (it.link || it.title).toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "") }; };

// ------------------------------------------------------------ people on a team page
export interface Person { name: string; role: string; email: string | null }
const ROLE = "(?:(?:artistic|musical|programme|program|music|festival|label|general|executive|managing|creative|co-?)\\s+)*(?:director|curator|programmer|booker|producer|manager|founder|editor|a&r|coordinator|head of [a-z ]{3,20})";
const NAME = "[\\p{L}][\\p{L}'’.-]+(?:[ \\t]+[\\p{L}][\\p{L}'’.-]+){1,2}";
const CAPS = /^(?:\p{Lu}[\p{L}'’.-]*)(?:[ \t]+\p{Lu}[\p{L}'’.-]*){1,2}$/u; // the "i" flag makes the pattern blind to case, so capitals are checked here
export function findPeople(text: string): Person[] {
  const out: Person[] = []; const seen = new Set<string>();
  const add = (name: string, role: string, ctx: string) => {
    const n = name.trim(); if (!CAPS.test(n) || seen.has(n.toLowerCase()) || /\b(Team|Contact|About|Press|Festival|Music|Records|Label)\b/.test(n)) return; seen.add(n.toLowerCase());
    const mails = findEmails(ctx); const first = n.split(/\s+/)[0].toLowerCase();
    out.push({ name: n, role: role.replace(/\s+/g, " ").trim(), email: mails.find((e) => e.includes(first)) ?? null });
  };
  for (const m of text.matchAll(new RegExp(`(${NAME})\\s*[,–—|:/-]\\s*(${ROLE})`, "giu"))) add(m[1], m[2], text.slice(m.index ?? 0, (m.index ?? 0) + 260));
  for (const m of text.matchAll(new RegExp(`(${ROLE})\\s*[:–—|-]\\s*(${NAME})`, "giu"))) add(m[2], m[1], text.slice(m.index ?? 0, (m.index ?? 0) + 260));
  return out.slice(0, 12);
}
/** Same-site pages that probably name the team. */
export function teamLinks(html: string, base: string): string[] {
  let host = ""; try { host = new URL(base).host; } catch { return []; }
  const urls = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    if (!/(team|about|contact|equipe|qui-sommes|staff|people|crew|a-propos|propos|kontakt|ueber)/i.test(m[1])) continue;
    try { const u = new URL(m[1], base); if (u.host === host && /^https?:$/.test(u.protocol)) urls.add(u.toString().replace(/#.*$/, "")); } catch { /* skip */ }
  }
  return [...urls].slice(0, 3);
}
