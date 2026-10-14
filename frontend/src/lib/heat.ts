/** Thermal lens, the testable part: how warm a page is. No DOM, no network. */
export type Heat = 0 | 1 | 2 | 3 | 4;
const DAY = 86400;

/** 4 = within a day, 3 = three days, 2 = a week, 1 = a month, 0 = colder than that. */
export function heatOf(ageSeconds: number): Heat {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 4; // a clock a little ahead of ours is still "just now"
  return ageSeconds <= DAY ? 4 : ageSeconds <= 3 * DAY ? 3 : ageSeconds <= 7 * DAY ? 2 : ageSeconds <= 30 * DAY ? 1 : 0;
}

interface Branch { slug: string; lastActivityAt?: string | null }
interface Channel { slug: string; kind?: string; lastMessageAt?: number | null }
interface Study { slug: string; updatedAt?: string | null }

const secs = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t / 1000 : null; };

/** Address -> heat, for every page we know a last-activity time for. Pages with no known time are left out, so they stay neutral. */
export function buildHeatMap(branches: Branch[], channels: Channel[], studies: Study[], nowSec: number): Map<string, Heat> {
  const m = new Map<string, Heat>();
  for (const b of branches) { const t = secs(b.lastActivityAt); if (t !== null) m.set(`/branch/${b.slug}`, heatOf(nowSec - t)); }
  for (const c of channels) if (c.kind !== "BRANCH" && typeof c.lastMessageAt === "number") m.set(`/topic/${c.slug}`, heatOf(nowSec - c.lastMessageAt));
  for (const s of studies) { const t = secs(s.updatedAt); if (t !== null) m.set(`/study/${s.slug}`, heatOf(nowSec - t)); }
  return m;
}

/** The path of an href when it points at this site, without query or hash. */
export function pathOfHref(href: string, origin: string): string | null {
  try { const u = new URL(href, origin); return u.origin === origin ? u.pathname.replace(/\/$/, "").replace(/^(\/branch\/[^/]+)\/room$/, "$1") || "/" : null; } catch { return null; }
}

/** Thermal's second reading (a community milestone): warm = scanned by many members. */
const SCAN_PATH: Record<string, string> = { album: "/album/", calbum: "/community-album/", study: "/study/", wiki: "/wiki/", branch: "/branch/", user: "/u/" };
export function pathOfScanKey(key: string): string | null {
  const i = key.indexOf(":");
  const base = i > 0 ? SCAN_PATH[key.slice(0, i)] : undefined;
  return base ? base + key.slice(i + 1) : null;
}
/** Counts on a log scale against the busiest page, so one runaway page doesn't turn everything else cold. */
export function buildScanHeat(rows: [string, number][]): Map<string, Heat> {
  const m = new Map<string, Heat>();
  const max = rows.reduce((a, [, n]) => Math.max(a, n), 0);
  if (max <= 0) return m;
  for (const [key, n] of rows) {
    const path = pathOfScanKey(key);
    if (!path || n <= 0) continue;
    const r = Math.log1p(n) / Math.log1p(max);
    m.set(path, r >= 0.8 ? 4 : r >= 0.6 ? 3 : r >= 0.4 ? 2 : r >= 0.2 ? 1 : 0);
  }
  return m;
}
