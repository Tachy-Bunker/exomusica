export interface StormArm { kind: "track" | "lore" | "person"; label: string | null; n: number }
export interface StormNow {
  locked: boolean; state?: "active" | "ended"; startsAt?: number; endsAt?: number; goal?: number; count?: number; full?: boolean; serverNow?: number;
  artifact?: { seed: number; total: number; arms: StormArm[] } | null;
}
export const STORM_MS = 48 * 3_600_000, BANNER_AFTER_MS = 7 * 86_400_000;
/** Is it worth asking the server about the storm at all? Not before the milestone, and not long after the storm is over. */
export const stormWorthAsking = (reachedAt: string | number | null, now: number): boolean => { if (!reachedAt) return false; const t = +new Date(reachedAt); return Number.isFinite(t) && now >= t && now < t + STORM_MS + BANNER_AFTER_MS; };

export function left(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} days`;
}

/** Tiny seeded generator: the same storm always draws and sounds the same. */
export function rng(seed: number): () => number { let s = (seed | 0) || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export interface Spoke { angle: number; length: number; sway: number; kind: StormArm["kind"] }
/** One spoke per arm: longer for what was scanned more, turned by the seed, bent the way the storm winds. */
export function spokes(seed: number, arms: StormArm[]): Spoke[] {
  const r = rng(seed), top = Math.max(1, ...arms.map((a) => a.n)), turn = r() * Math.PI * 2;
  return arms.map((a, i) => ({ angle: turn + (i * Math.PI * 2) / Math.max(1, arms.length), length: 0.3 + 0.7 * (a.n / top), sway: 0.35 + r() * 0.5, kind: a.kind }));
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // a major pentatonic over two octaves
/** Nine notes: which scale step and how long, taken from the seed and the counts. */
export function notes(seed: number, arms: StormArm[], root = 110): { hz: number; beats: number }[] {
  const r = rng(seed ^ 0x9e3779b9), top = Math.max(1, ...arms.map((a) => a.n));
  return arms.map((a) => ({ hz: root * Math.pow(2, SCALE[Math.floor(r() * SCALE.length)] / 12), beats: a.n / top > 0.6 ? 2 : 1 }));
}
