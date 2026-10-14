// Two small "found again" features unlocked by community milestones: a random fragment of the Log (Index) and a daily echo of an old chat message (Echo).
// Pure, so the picking rules are tested without a database.
import { plainExcerpt } from "./publicChannels.js";

const FRAGMENT_MIN = 60, FRAGMENT_MAX = 320;

/** A readable paragraph from a page's markdown: prose only (no headings, tables, list bullets, embeds or special @lines). */
export function pickFragment(markdown: string, rand: () => number = Math.random): string | null {
  const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^(#|\||>|[-*+] |\d+\.\s|@|\{|:::|```|!\[)/.test(p));
  const good = paragraphs.map((p) => plainExcerpt(p, FRAGMENT_MAX)).filter((t) => t.length >= FRAGMENT_MIN && (t.match(/[A-Za-zÀ-ɏ]/g)?.length ?? 0) > t.length * 0.5);
  return good.length ? good[Math.min(good.length - 1, Math.floor(rand() * good.length))]! : null;
}

/** UTC calendar day, e.g. "2026-10-14": everyone sees the same echo for that whole day. */
export const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/** A stable number in 0..n-1 for a day (FNV-1a), so the day decides which old message returns. */
export function seededIndex(day: string, n: number): number {
  if (n <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}

export interface EchoRow { id: number; contentRaw: string; createdAt: Date; author: string; channelSlug: string; channelName: string }
export interface Echo { text: string; by: string; channelName: string; at: number; href: string }
const pad = (n: number) => String(n).padStart(2, "0");

/** The first row that reads well on its own: some text, not a command, not mostly a link. */
export function echoPick(rows: EchoRow[]): Echo | null {
  for (const r of rows) {
    if (r.contentRaw.length > 1200 || /^\s*[/!]/.test(r.contentRaw)) continue;
    const text = plainExcerpt(r.contentRaw, 400);
    if (text.length < 40 || text.endsWith("…")) continue; // too short to stand alone, or too long to show whole
    const day = `${r.createdAt.getUTCFullYear()}-${pad(r.createdAt.getUTCMonth() + 1)}-${pad(r.createdAt.getUTCDate())}`;
    return { text, by: r.author, channelName: r.channelName, at: r.createdAt.getTime(), href: `/topic/${r.channelSlug}?day=${day}#m-${r.id}` };
  }
  return null;
}
