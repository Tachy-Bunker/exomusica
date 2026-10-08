// The site's "atlas": how entities (a branch, a study, a wiki page...) are named, linked and related. Pure, so it is tested without a database.

export const ENTITY_TYPES = ["branch", "study", "album", "wiki", "news", "topic", "resource", "call"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

const KEY_RE = new RegExp(`^(${ENTITY_TYPES.join("|")}):([a-z0-9][a-z0-9_-]{0,99})$`);

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v);
}

/** "study:beating-tones" -> its parts, or null for anything that is not a well-formed key. */
export function parseKey(key: unknown): { type: EntityType; id: string } | null {
  if (typeof key !== "string") return null;
  const m = KEY_RE.exec(key);
  return m ? { type: m[1] as EntityType, id: m[2] } : null;
}

export const keyOf = (type: EntityType, id: string | number): string => `${type}:${String(id).toLowerCase()}`;

export function hrefOf(type: EntityType, id: string): string {
  switch (type) {
    case "branch": return `/branch/${id}`;
    case "study": return `/study/${id}`;
    case "album": return `/album/${id}`;
    case "wiki": return `/wiki/${id}`;
    case "news": return `/news/${id}`;
    case "topic": return `/topic/${id}`;
    case "resource": return `/resource/${id}`;
    case "call": return `/open-call/${id}`;
  }
}

/** The pairs a client reports: well-formed, distinct ends, no repeats, at most `max`. */
export function cleanEdges(raw: unknown, max = 10): [string, string][] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const e of raw) {
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [a, b] = e;
    if (!parseKey(a) || !parseKey(b) || a === b) continue;
    const id = `${a}>${b}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push([a as string, b as string]);
    if (out.length >= max) break;
  }
  return out;
}

/** Strongest onward routes: only those taken `minN` or more times, strongest first. */
export function topPaths(rows: { to: string; n: number }[], minN = 3, limit = 3): string[] {
  return rows.filter((r) => r.n >= minN).sort((a, b) => b.n - a.n || a.to.localeCompare(b.to)).slice(0, limit).map((r) => r.to);
}

export interface Neighbor { type: EntityType; key: string; title: string; href: string; sub?: string; image?: string | null }

/** Joins lists in order, dropping repeats (by key) and the focus itself, and keeping at most `max`. */
export function mergeNeighbors(lists: Neighbor[][], self: string, max = 8): Neighbor[] {
  const seen = new Set<string>([self]);
  const out: Neighbor[] = [];
  for (const l of lists) for (const n of l) {
    if (seen.has(n.key)) continue;
    seen.add(n.key);
    out.push(n);
    if (out.length >= max) return out;
  }
  return out;
}
