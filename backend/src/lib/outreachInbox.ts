/** Open calls found in mail: a newsletter that lists several, or a single mail that is one. Pure over the parsed mail, so it is tested without an inbox. */
import { findDeadline, findEmails, findFee, htmlToText } from "./outreachPlus.js";
import { looksLikeCall, splitNewsletter, type FoundCall } from "./outreachCollect.js";

export interface InboxFacts { from: string; subject: string; text: string; html: string; listUnsubscribe: boolean; own: Set<string> }

/** Links survive the trip to text: <a href=U>label</a> becomes "label U", which is what a call's address is. */
export function mailText(html: string, text: string): string {
  if (html) {
    const withLinks = html.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); const u = href.replace(/&amp;/g, "&");
      return /^https?:/i.test(u) ? ` ${l && l !== u ? l + " " : ""}${u} ` : ` ${l} `;
    });
    const t = htmlToText(withLinks); if (t.trim().length >= (text?.trim().length ?? 0) * 0.5) return t;
  }
  return text ?? "";
}

const NOT_A_CALL = /\b(receipt|invoice|order\s*#?\d|your order|password|verify your|confirm your (?:email|account)|security alert|sign[- ]in|statement|shipping|delivery|payment (?:due|received)|facture|reçu|mot de passe|subscription (?:renewal|confirmed)|unsubscribe confirmation)\b/i;
const JUNK_URL = /(unsubscribe|optout|opt-out|preferences|privacy|terms|mailto:|manage[-_]?subscription|view[-_]?in[-_]?browser|\.(?:png|jpe?g|gif|svg)(?:\?|$)|facebook\.com|twitter\.com|x\.com\/|instagram\.com|linkedin\.com|tracking|click\.)/i;

const keyOf = (url: string, title: string): string => (url || title).toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");

export function callsFromMail(f: InboxFacts, today: string): FoundCall[] {
  const from = f.from.toLowerCase(); if (f.own.has(from)) return [];
  if (NOT_A_CALL.test(f.subject)) return [];
  const body = mailText(f.html, f.text).replace(/\r/g, "");
  const urls = [...body.matchAll(/https?:\/\/[^\s<>)\]"']+/g)].map((m) => m[0].replace(/[.,;]+$/, ""));
  const real = urls.filter((u) => !JUNK_URL.test(u));
  const newsletter = f.listUnsubscribe || real.length >= 4 || body.length > 2500;
  let out: FoundCall[];
  if (newsletter) out = splitNewsletter(body, today).filter((c) => !JUNK_URL.test(c.url));
  else {
    const head = body.slice(0, 3000), deadline = findDeadline(head, today);
    if (!looksLikeCall(f.subject, head) || (!deadline && !real.length)) return [];
    const title = f.subject.replace(/^\s*((re|fwd?|tr)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().slice(0, 110) || "Open call";
    const url = real[0] ?? "";
    out = [{ title, url, summary: head.replace(/\s+/g, " ").slice(0, 400), deadline, fee: findFee(head), emails: findEmails(head).filter((e) => !f.own.has(e.toLowerCase())), key: keyOf(url, title) }];
  }
  const seen = new Set<string>();
  return out.filter((c) => { if (seen.has(c.key)) return false; seen.add(c.key); return true; }).slice(0, 40);
}
