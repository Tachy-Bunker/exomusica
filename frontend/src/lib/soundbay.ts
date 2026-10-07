// Searching, filtering and sorting for the Soundbay page. Pure, so it is tested without a browser.
import type { HomeBranch } from "./home";
import { fold } from "./spaceHubs";

export type BranchFilterKey = "all" | "recent" | "chat" | "albums";
export type SoundbaySort = "active" | "az" | "albums";
const DAY = 86_400_000;

export const FILTER_LABEL: Record<BranchFilterKey, string> = { all: "All", recent: "Active this month", chat: "Has a discussion", albums: "Has albums" };
export const SORT_LABEL: Record<SoundbaySort, string> = { active: "Most recently active", az: "A to Z", albums: "Most albums" };

const matchesQuery = (text: string, query: string) => {
  const h = fold(text);
  return fold(query).split(/\s+/).filter(Boolean).every((w) => h.includes(w));
};

export function filterBranches(list: HomeBranch[], filter: BranchFilterKey, query: string, now = Date.now()): HomeBranch[] {
  return list.filter((b) => {
    if (filter === "recent" && (b.lastActiveAt === null || now - b.lastActiveAt > 30 * DAY)) return false;
    if (filter === "chat" && !b.chatSlug) return false;
    if (filter === "albums" && b.albums === 0) return false;
    return !query.trim() || matchesQuery(`${b.name} ${b.blurb}`, query);
  });
}

export function sortBranches(list: HomeBranch[], sort: SoundbaySort): HomeBranch[] {
  const byName = (a: HomeBranch, b: HomeBranch) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const copy = [...list];
  if (sort === "az") return copy.sort(byName);
  if (sort === "albums") return copy.sort((a, b) => b.albums - a.albums || (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) || byName(a, b));
  return copy.sort((a, b) => (b.lastActiveAt ?? -1) - (a.lastActiveAt ?? -1) || byName(a, b)); // branches nobody has touched come last
}

/** Playlists and community albums: a search over their words; "A to Z" sorts them, the other sorts keep the server's order (newest first). */
export function filterSimple<T>(list: T[], query: string, text: (t: T) => string): T[] {
  return query.trim() ? list.filter((t) => matchesQuery(text(t), query)) : list;
}
export function sortSimple<T>(list: T[], sort: SoundbaySort, title: (t: T) => string): T[] {
  return sort === "az" ? [...list].sort((a, b) => title(a).localeCompare(title(b), undefined, { sensitivity: "base" })) : list;
}

export const SECTIONS = [
  { id: "sb-branches", label: "Branches" },
  { id: "sb-seeds", label: "Growing seeds" },
  { id: "sb-playlists", label: "Playlists" },
  { id: "sb-albums", label: "Community albums" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/** The branch that is playing right now goes to the top of its list, for as long as it plays (everything else keeps its order). */
export function pinPlaying<T extends { slug: string }>(rows: T[], playingSlug: string | null): T[] {
  if (!playingSlug) return rows;
  const i = rows.findIndex((r) => r.slug === playingSlug);
  return i <= 0 ? rows : [rows[i], ...rows.slice(0, i), ...rows.slice(i + 1)];
}

/** Up to three pictures for a branch's preview: its own cover first, then its albums' covers, each only once. */
export function galleryOf(branchCover: string | null, albums: { slug: string; title: string; coverArtUrl: string | null }[], max = 3): { url: string; label: string; albumSlug: string | null }[] {
  const out: { url: string; label: string; albumSlug: string | null }[] = [];
  const seen = new Set<string>();
  const add = (url: string | null, label: string, albumSlug: string | null) => { if (url && !seen.has(url) && out.length < max) { seen.add(url); out.push({ url, label, albumSlug }); } };
  add(branchCover, "Branch cover", null);
  for (const a of albums) add(a.coverArtUrl, a.title, a.slug);
  return out;
}
