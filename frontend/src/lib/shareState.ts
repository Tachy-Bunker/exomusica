// What a shareable link says, and how to read it back. Everything a link can carry lives in the address, in one format used by the normal
// pages and the embeds alike. Pure, so it is tested without a browser.

export type TrackSource = "official" | "community";
export interface TrackRef { source: TrackSource; id: number }

const MAX_SECONDS = 86_399;
const MAX_GENRES = 100;
const MAX_NAME = 100;

/**
 * A time in a link: plain seconds (83), 83s, 1:23, 1:02:03, 1m23s, 1h2m3s. Anything else is null. Whole seconds, never negative,
 * never beyond a day.
 */
export function parseTimestamp(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let total: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)s?$/))) {
    total = parseFloat(m[1]);
  } else if ((m = s.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?(?:\.\d+)?$/))) {
    // m:ss or h:mm:ss; with three parts the middle one is minutes and must be under 60
    if (m[3] !== undefined) {
      if (Number(m[2]) > 59) return null;
      total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } else {
      total = Number(m[1]) * 60 + Number(m[2]);
    }
  } else if ((m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/)) && /[hm]/.test(s)) {
    if (m[1] === undefined && m[2] === undefined && m[3] === undefined) return null;
    total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  if (total === null || !Number.isFinite(total) || total < 0) return null;
  return Math.min(MAX_SECONDS, Math.floor(total));
}

/** 83 becomes "1:23", 3723 becomes "1:02:03". */
export function formatTimestamp(seconds: number): string {
  const n = Math.max(0, Math.min(MAX_SECONDS, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
  const h = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}

/** "12" is an official track, "c12" a community one (the two sets number their tracks separately). */
export function parseTrackRef(raw: string | null | undefined): TrackRef | null {
  const m = (raw ?? "").trim().match(/^([oc])?(\d{1,9})$/i);
  if (!m || Number(m[2]) < 1) return null;
  return { source: m[1]?.toLowerCase() === "c" ? "community" : "official", id: Number(m[2]) };
}
export const trackRefParam = (t: { id: number; source?: string | null }): string => (t.source === "community" ? `c${t.id}` : `${t.id}`);
export const sameTrack = (t: { id: number; source?: string | null }, ref: TrackRef): boolean => t.id === ref.id && (t.source === "community") === (ref.source === "community");

/** Start playing when the link is opened: which song, and from when. */
export interface AutoplayRequest { play: boolean; track: TrackRef | null; t: number | null }
export function parseAutoplay(p: URLSearchParams): AutoplayRequest {
  const play = p.get("play");
  return { play: play === "1" || play === "true", track: parseTrackRef(p.get("track")), t: parseTimestamp(p.get("t")) };
}
export function setAutoplayParams(p: URLSearchParams, a: { play?: boolean; track?: { id: number; source?: string | null } | null; t?: number | null }): URLSearchParams {
  for (const k of ["play", "track", "t"]) p.delete(k);
  if (a.track) p.set("track", trackRefParam(a.track));
  if (a.track && a.t && a.t > 0) p.set("t", formatTimestamp(a.t));
  if (a.play) p.set("play", "1");
  return p;
}

/** A playlist map as a link can describe it: which view, and which genres are soloed or switched off. */
export interface MapShare { view: "map" | "venn"; solo: string[]; off: string[]; hideControls: boolean }
const cleanNames = (xs: string[]): string[] => [...new Set(xs.map((x) => x.trim()).filter((x) => x && x.length <= MAX_NAME))].slice(0, MAX_GENRES);

export function parseMapShare(p: URLSearchParams, hash = ""): MapShare {
  const solo = cleanNames(p.getAll("solo"));
  const off = cleanNames(p.getAll("off")).filter((g) => !solo.includes(g)); // soloed wins if a link says both
  return { view: p.get("view") === "venn" || hash === "#venn" ? "venn" : "map", solo, off, hideControls: p.get("hideControls") === "1" };
}
export function setMapShareParams(p: URLSearchParams, s: Partial<MapShare>): URLSearchParams {
  for (const k of ["view", "solo", "off", "hideControls"]) p.delete(k);
  if (s.view === "venn") p.set("view", "venn");
  for (const g of cleanNames(s.solo ?? [])) p.append("solo", g);
  for (const g of cleanNames(s.off ?? [])) p.append("off", g);
  if (s.hideControls) p.set("hideControls", "1");
  return p;
}

type GenreState = Record<string, "on" | "highlight" | "off">;
/** The map's genre switches from a link, keeping only genres this playlist really has (matched ignoring case). */
export function genreStateFromShare(s: { solo: string[]; off: string[] }, known: Iterable<string>): GenreState {
  const byLower = new Map<string, string>();
  for (const g of known) byLower.set(g.toLowerCase(), g);
  const out: GenreState = {};
  for (const g of s.off) { const k = byLower.get(g.toLowerCase()); if (k) out[k] = "off"; }
  for (const g of s.solo) { const k = byLower.get(g.toLowerCase()); if (k) out[k] = "highlight"; }
  return out;
}
/** The other way: what to write into a link (sorted, so the same state always gives the same link). */
export function shareFromGenreState(state: GenreState): { solo: string[]; off: string[] } {
  const pick = (v: string) => Object.entries(state).filter(([, s]) => s === v).map(([g]) => g).sort((a, b) => a.localeCompare(b));
  return { solo: pick("highlight"), off: pick("off") };
}

/** Soundbay's `open=a,b,c`: the branches to show expanded. Only plain slugs, each once, at most twenty. */
export function parseOpenList(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const slug = part.trim();
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= 20) break;
  }
  return out;
}
export const openListParam = (slugs: string[]): string => slugs.join(",");

export function buildShareUrl(origin: string, pathname: string, params: URLSearchParams, hash = ""): string {
  const q = params.toString();
  return `${origin}${pathname}${q ? `?${q}` : ""}${hash}`;
}
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function embedSnippet(url: string, size: { width: number; height: number } = { width: 800, height: 600 }): string {
  const w = Math.max(200, Math.min(4000, Math.round(size.width))), h = Math.max(150, Math.min(4000, Math.round(size.height)));
  return `<iframe src="${escapeAttr(url)}" width="${w}" height="${h}" style="border:0;" allow="autoplay" title="Exomusica"></iframe>`;
}
