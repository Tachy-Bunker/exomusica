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

export interface RAlbumTrack extends RTrack { albumId: number; position: number }
/** Album by album: the albums come in a shuffled order (the same for everyone for the same seed), and each album plays its tracks in its own order.
 *  Every album is heard once before any album comes round again, so the queue never repeats an album back to back or in pieces. Tracks without a known length are left out. */
export function orderAlbums<T extends RAlbumTrack>(tracks: T[], seed: string): T[] {
  const byAlbum = new Map<number, T[]>();
  for (const t of tracks) {
    if ((t.durationSeconds ?? 0) < 1) continue;
    const list = byAlbum.get(t.albumId);
    if (list) list.push(t); else byAlbum.set(t.albumId, [t]);
  }
  const albums = [...byAlbum.keys()].sort((a, b) => a - b);
  const r = rng(hashStr(seed));
  for (let i = albums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [albums[i], albums[j]] = [albums[j], albums[i]]; }
  const out: T[] = [];
  for (const id of albums) out.push(...byAlbum.get(id)!.sort((a, b) => a.position - b.position || a.id - b.id));
  return out;
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

// ---- Stations that are not tied to a branch: Crate radio (public playlists) and Long wave (the whole catalogue). Same idea: a loop everyone locates the same way from the clock.
/** The loops start counting from here, so "where in the loop are we" is the same for everyone and needs no state. */
export const STATION_EPOCH_MS = Date.UTC(2026, 0, 1);

export interface CratePlaylist<T extends RTrack = RTrack> { id: number; title: string; owner: string; slug: string; tracks: T[] }
export interface CrateEntry<T extends RTrack = RTrack> extends RTrack { track: T; playlist: { title: string; owner: string; slug: string } }

/** Playlists are shuffled (new order each UTC day, same for everyone) and each one is played through in its own order. Playlists with nothing playable are skipped. */
export function orderCrate<T extends RTrack>(playlists: CratePlaylist<T>[], day: string): CrateEntry<T>[] {
  const lists = playlists.filter((p) => p.tracks.some((t) => (t.durationSeconds ?? 0) >= 1)).sort((a, b) => a.id - b.id);
  const r = rng(hashStr(`crate-${day}`));
  for (let i = lists.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lists[i], lists[j]] = [lists[j], lists[i]]; }
  const out: CrateEntry<T>[] = [];
  for (const p of lists) for (const t of p.tracks) if ((t.durationSeconds ?? 0) >= 1) out.push({ id: t.id, durationSeconds: t.durationSeconds, track: t, playlist: { title: p.title, owner: p.owner, slug: p.slug } });
  return out;
}

/** Seconds into a station's loop at this moment. */
export const loopElapsed = (now: number): number => Math.max(0, (now - STATION_EPOCH_MS) / 1000);
