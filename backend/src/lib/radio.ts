// Radio is a clock, not a stream: everyone computes the same "what's on now" from the time of day, so there is nothing to keep running on the server.

export interface Block { startHour: number; hours: number; branchSlug: string }
export const AUTO_BLOCK_HOURS = 3;
const H = 3600;

/** Does this block cover the UTC hour? Blocks may wrap past midnight. */
export const covers = (b: { startHour: number; hours: number }, hour: number): boolean => ((hour - b.startHour + 24) % 24) < b.hours;

/** The admin's block for this hour (the earliest-starting one wins when two overlap), or null. */
export function blockFor(blocks: Block[], hour: number): Block | null {
  return [...blocks].sort((a, b) => a.startHour - b.startHour).find((b) => covers(b, hour)) ?? null;
}

/** With no block set, the day is cut into 3-hour parts handed to the branches in turn. */
export function autoBlock(slugs: string[], hour: number): Block | null {
  if (slugs.length === 0) return null;
  const part = Math.floor(hour / AUTO_BLOCK_HOURS);
  return { startHour: part * AUTO_BLOCK_HOURS, hours: AUTO_BLOCK_HOURS, branchSlug: slugs[part % slugs.length] };
}

/** When this block's current run began, in ms (a block that wraps midnight began yesterday). */
export function runStart(b: { startHour: number }, now: number): number {
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const t = day + b.startHour * H * 1000;
  return t <= now ? t : t - 86_400_000;
}

export const runEnd = (b: { startHour: number; hours: number }, now: number): number => runStart(b, now) + b.hours * H * 1000;

function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export interface RTrack { id: number; durationSeconds: number | null }
/** Same order for everyone for the same seed; tracks without a known length can't be scheduled and are left out. */
export function orderTracks<T extends RTrack>(tracks: T[], seed: string): T[] {
  const list = tracks.filter((t) => (t.durationSeconds ?? 0) >= 1).sort((a, b) => a.id - b.id);
  const r = rng(hashStr(seed));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

/** Where `elapsed` seconds into the loop falls: which track, how far in, how long is left of it, and the next ones. */
export function locate<T extends RTrack>(ordered: T[], elapsed: number): { track: T; offset: number; remaining: number; upcoming: T[] } | null {
  if (ordered.length === 0) return null;
  const total = ordered.reduce((s, t) => s + t.durationSeconds!, 0);
  let pos = ((elapsed % total) + total) % total;
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i].durationSeconds!;
    if (pos < d) return { track: ordered[i], offset: pos, remaining: d - pos, upcoming: [1, 2, 3].map((k) => ordered[(i + k) % ordered.length]).filter((t, k, a) => t !== ordered[i] && a.indexOf(t) === k) };
    pos -= d;
  }
  return null;
}
