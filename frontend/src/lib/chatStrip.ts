// The conversation spectrogram and the catch-up reel. Pure: no DOM, no network, so it is tested without a browser.
import type { MessageDTO } from "./types";

export const STRIP_ROWS = 240;

const reactionCount = (m: MessageDTO): number => (m.reactions ?? []).reduce((n, r) => n + r.usernames.length, 0);

/** How "loud" a message is, 0..255: long, reacted-to, structured (poll, CQ, report...), with files or a link to a thing. Deleted ones are nearly dark. */
export function intensity(m: MessageDTO): number {
  if (m.isDeleted) return 8;
  const len = (m.contentRaw ?? "").length;
  let v = Math.min(150, 28 + Math.log2(1 + len) * 14);
  v += Math.min(60, reactionCount(m) * 20);
  if (m.kind && m.kind !== "text") v = Math.max(v, 205);
  if (m.attachments?.length) v += 30;
  if (/\]\(https?:\/\//.test(m.contentRaw ?? "")) v += 18;
  return Math.max(0, Math.min(255, Math.round(v)));
}

export interface Span { top: number; height: number; value: number; mine: boolean }

/** Paints spans (pixel positions of each message in the list) onto `rows` rows. A row takes the loudest message touching it. */
export function paintRows(spans: Span[], total: number, rows = STRIP_ROWS): { value: Uint8Array; mine: Uint8Array } {
  const value = new Uint8Array(rows), mine = new Uint8Array(rows);
  if (total <= 0) return { value, mine };
  for (const s of spans) {
    const a = Math.max(0, Math.min(rows - 1, Math.floor((s.top / total) * rows)));
    const b = Math.max(a, Math.min(rows - 1, Math.ceil(((s.top + Math.max(1, s.height)) / total) * rows) - 1));
    for (let r = a; r <= b; r++) if (s.value >= value[r]) { value[r] = s.value; mine[r] = s.mine ? 1 : 0; }
  }
  return { value, mine };
}

/** Where in the list a click on the strip lands: centred on that point, kept inside the list. */
export function scrollTopFor(frac: number, scrollHeight: number, clientHeight: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return Math.max(0, Math.min(scrollHeight - clientHeight, f * scrollHeight - clientHeight / 2));
}

// ---- catch-up reel
export interface Reel { count: number; people: string[]; firstId: number; highlights: MessageDTO[] }
export const REEL_MIN = 10;

const score = (m: MessageDTO): number => intensity(m) + reactionCount(m) * 30 + (m.kind && m.kind !== "text" ? 40 : 0);

/** What happened while you were away: how many messages, who spoke, and up to three that mattered (the most reacted-to, structured, or substantial). Others' messages only. */
export function catchUp(messages: MessageDTO[], seenId: number, meId: number | null, minCount = REEL_MIN): Reel | null {
  const fresh = messages.filter((m) => m.id > seenId && !m.isDeleted && m.authorId !== meId);
  if (fresh.length < minCount) return null;
  const people = [...new Set(fresh.map((m) => m.authorUsername))];
  const top = [...fresh].sort((a, b) => score(b) - score(a) || a.id - b.id).slice(0, 3).sort((a, b) => a.id - b.id);
  return { count: fresh.length, people, firstId: fresh[0].id, highlights: top };
}

// ---- where you left off, per channel, on this device
const key = (slug: string) => `exomusica_seen_${slug}`;
export function getSeen(slug: string): number | null {
  try { const v = Number(localStorage.getItem(key(slug))); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
export function setSeen(slug: string, id: number): void {
  try { if (id > (getSeen(slug) ?? 0)) localStorage.setItem(key(slug), String(id)); } catch { /* storage blocked */ }
}
