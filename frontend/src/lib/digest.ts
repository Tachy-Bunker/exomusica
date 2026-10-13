export interface Digest {
  since: number;
  replies: { count: number; items: { by: string; text: string; href: string; where: string }[] };
  albums: { slug: string; title: string; branch: string }[];
  studies: { slug: string; title: string; owner: string }[];
  topics: { name: string; count: number; href: string }[];
}
const KEY = "exo_last_visit";
export const MIN_AWAY_MS = 6 * 3_600_000;

export function readLastVisit(): number | null {
  try { const n = Number(localStorage.getItem(KEY)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}
export function markVisit(now = Date.now()): void { try { localStorage.setItem(KEY, String(now)); } catch { /* private window */ } }

/** Only someone who was away for a while sees the card, and only if there is something to say. */
export function worthShowing(last: number | null, d: Digest | null, now = Date.now()): boolean {
  if (last == null || now - last < MIN_AWAY_MS || !d || !Array.isArray(d.topics)) return false;
  return d.replies.count + d.albums.length + d.studies.length + d.topics.length > 0;
}

export function awayLabel(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}
