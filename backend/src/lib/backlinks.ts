/** X-Ray lens, the testable part: which pages are allowed to be asked about, and which texts really link to one. No database here. */
const PATH_RE = /^\/(branch|album|study|wiki|news|u|topic|collaborator|playlist|community-album)\/[A-Za-z0-9._~%-]{1,120}$/;

export const validBacklinkPath = (p: unknown): p is string => typeof p === "string" && p.length <= 200 && PATH_RE.test(p);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `text` links to exactly `path` (so /album/al1 is not found inside /album/al10, and a longer path or a query string still counts). */
export function linksTo(text: string, path: string): boolean {
  return new RegExp(esc(path) + "(?![A-Za-z0-9._~%-])").test(text);
}
