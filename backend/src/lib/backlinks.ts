/** X-Ray lens, the testable part: which pages are allowed to be asked about, and which texts really link to one. No database here. */
const PATH_RE = /^\/(branch|album|study|wiki|news|u|topic|collaborator|playlist|community-album)\/[A-Za-z0-9._~%-]{1,120}$/;

export const validBacklinkPath = (p: unknown): p is string => typeof p === "string" && p.length <= 200 && PATH_RE.test(p);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `text` links to exactly `path` (so /album/al1 is not found inside /album/al10, and a longer path or a query string still counts). */
export function linksTo(text: string, path: string): boolean {
  return new RegExp(esc(path) + "(?![A-Za-z0-9._~%-])").test(text);
}

export interface BackHit { type: "study" | "wiki" | "news"; slug: string; title: string; href: string }
export interface SecondHit extends BackHit { via: string }
/** Two links away: for each page that links here, the pages that link to *it*. Pages already shown in the first ring, the page itself and repeats are dropped; each remaining page remembers the first page it came through. */
export function secondRing(self: string, direct: BackHit[], viaHits: Map<string, BackHit[]>, cap = 20): SecondHit[] {
  const seen = new Set<string>([self, ...direct.map((d) => d.href)]);
  const out: SecondHit[] = [];
  for (const d of direct) {
    for (const h of viaHits.get(d.href) ?? []) {
      if (seen.has(h.href)) continue;
      seen.add(h.href);
      out.push({ ...h, via: d.title });
      if (out.length >= cap) return out;
    }
  }
  return out;
}
