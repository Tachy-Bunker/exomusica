// "Forgotten" threads: quiet for a long time and not visited by you either. Visiting clears it for another stretch.
export const FORGOTTEN_DAYS = 60;
const DAY = 86400;
/** All times are unix seconds. A thread with no messages at all is new, not forgotten. */
export function isForgotten(lastMessageAt: number | null | undefined, visitedAt: number | null | undefined, now: number, days = FORGOTTEN_DAYS): boolean {
  if (!lastMessageAt) return false;
  return now - Math.max(lastMessageAt, visitedAt ?? 0) > days * DAY;
}
const KEY = "exomusica_thread_visits";
const read = (): Record<string, number> => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
export const threadVisits = read;
export function recordThreadVisit(slug: string, now = Math.floor(Date.now() / 1000)): void {
  try {
    const m = read(); m[slug] = now;
    const keys = Object.keys(m);
    if (keys.length > 400) for (const k of keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 400)) delete m[k];
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch { /* storage blocked */ }
}
