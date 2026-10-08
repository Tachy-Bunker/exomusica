// The site's "atlas": everything that can be a place you are looking at (a branch, a study, a wiki page...), what to call it, and how to find it by typing.
// Pure functions, tested without a browser.

export const ENTITY_TYPES = ["branch", "study", "album", "wiki", "news", "topic", "resource", "call"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface Entity { type: EntityType; id: string; title: string; sub?: string; image?: string | null }
export interface Peek extends Entity { key: string; href: string }

export const TYPE_LABEL: Record<EntityType, string> = { branch: "Branch", study: "Study", album: "Album", wiki: "Wiki", news: "News", topic: "Topic", resource: "Resource", call: "Open call" };

export const keyOf = (type: EntityType, id: string): string => `${type}:${id.toLowerCase()}`;

export function hrefOf(type: EntityType, id: string): string {
  switch (type) {
    case "branch": return `/branch/${id}`;
    case "study": return `/study/${id}`;
    case "album": return `/album/${id}`;
    case "wiki": return `/wiki/${id}`;
    case "news": return `/news/${id}`;
    case "topic": return `/topic/${id}`;
    case "resource": return `/xenolab?tab=resources&item=${encodeURIComponent(id)}`;
    case "call": return `/xenolab?tab=open&call=${encodeURIComponent(id)}`;
  }
}

/** What the page at this address is "about", if it is one thing. */
export function focusOf(pathname: string, search = ""): { type: EntityType; id: string } | null {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const one = (t: EntityType, prefix: string): { type: EntityType; id: string } | null => (seg.length === 2 && seg[0] === prefix ? { type: t, id: decodeURIComponent(seg[1]).toLowerCase() } : null);
  const hit = one("study", "study") ?? one("branch", "branch") ?? one("album", "album") ?? one("wiki", "wiki") ?? one("news", "news") ?? one("topic", "topic");
  if (hit) return hit;
  if (seg[0] === "xenolab" && seg.length === 1) {
    const q = new URLSearchParams(search);
    const item = q.get("item");
    const call = q.get("call");
    if (q.get("tab") === "resources" && item && /^\d+$/.test(item)) return { type: "resource", id: item };
    if (q.get("tab") === "open" && call && /^\d+$/.test(call)) return { type: "call", id: call };
  }
  return null;
}

// ---- frequencies: every thing has a calm, stable "frequency" shown on the faceplate. Purely a look; each kind lives in its own amateur band.
const BANDS: Record<EntityType, [number, number]> = {
  topic: [1.8, 2.0], wiki: [3.5, 4.0], study: [7.0, 7.3], resource: [10.1, 10.15], branch: [14.0, 14.35], call: [18.068, 18.168], album: [21.0, 21.45], news: [28.0, 29.7],
};
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16; // final mixing: names that differ in one letter still land far apart
  return h >>> 0;
}
export function freqOf(type: EntityType, id: string): number {
  const [lo, hi] = BANDS[type];
  const steps = Math.round((hi - lo) * 1000);
  return Math.round((lo + (fnv(`${type}:${id.toLowerCase()}`) % (steps + 1)) / 1000) * 1000) / 1000;
}
export const showFreq = (f: number): string => f.toFixed(3);

// ---- finding things by typing
const norm = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** How well `query` matches `text`: higher is better, -1 = no match. Prefix of the whole > prefix of a word > all words found > letters in order. */
export function fuzzyScore(query: string, text: string): number {
  const q = norm(query).trim();
  const t = norm(text);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - Math.min(20, t.length - q.length) / 4;
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  const qWords = q.split(/\s+/).filter(Boolean);
  if (qWords.every((w) => words.some((x) => x.startsWith(w)))) return 60 - Math.min(20, t.length / 6);
  if (t.includes(q)) return 40 - Math.min(15, t.indexOf(q) / 4);
  let i = 0;
  for (const c of t) if (c === q[i] && ++i === q.length) break;
  return i === q.length && q.length >= 3 ? 10 : -1;
}

export function searchEntities(rows: Entity[], query: string, limit = 8, type?: EntityType): Entity[] {
  const scored: { e: Entity; s: number }[] = [];
  for (const e of rows) {
    if (type && e.type !== type) continue;
    const s = Math.max(fuzzyScore(query, e.title), fuzzyScore(query, e.id) - 5, e.sub ? fuzzyScore(query, e.sub) - 15 : -1);
    if (s >= 0) scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title)).slice(0, limit).map((x) => x.e);
}

/** Nearest things to a frequency, closest first. */
export function nearestFreq(rows: Entity[], f: number, limit = 5): { e: Entity; f: number }[] {
  return rows.map((e) => ({ e, f: freqOf(e.type, e.id) })).sort((a, b) => Math.abs(a.f - f) - Math.abs(b.f - f) || a.e.title.localeCompare(b.e.title)).slice(0, limit);
}

// ---- the trail: the last few things you looked at, newest first, no repeats
export interface TrailEntry { type: EntityType; id: string; title: string; href: string; image?: string | null }
export function pushTrail(trail: TrailEntry[], e: TrailEntry, max = 6): TrailEntry[] {
  return [e, ...trail.filter((x) => !(x.type === e.type && x.id === e.id))].slice(0, max);
}

export const peekOf = (e: Entity): Peek => ({ ...e, key: keyOf(e.type, e.id), href: hrefOf(e.type, e.id) });

// ---- the command line
export interface Command { verb: string; rest: string }
export function parseCommand(input: string): Command {
  const t = input.trim();
  if (!t) return { verb: "", rest: "" };
  if (t.startsWith("@")) return { verb: "@", rest: t.slice(1).trim() };
  if (t.startsWith("/")) return { verb: t.slice(1).split(/\s+/)[0].toLowerCase(), rest: t.slice(1).replace(/^\S*\s*/, "") };
  const m = /^(\S+)\s*(.*)$/s.exec(t)!;
  return { verb: m[1].toLowerCase(), rest: m[2].trim() };
}
