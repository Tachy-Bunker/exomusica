import { getJson } from "./sharedGet";
import type { MapLink } from "./hullLayout";
export type { MapLink } from "./hullLayout";

/** The stored map links (fix406): corridors and lift destinations. Empty when nothing is stored or the request fails. */
export const loadMapLinks = (): Promise<MapLink[]> => getJson<MapLink[]>("/api/map-links").then((r) => (Array.isArray(r) ? r : [])).catch(() => []);

/** The rooms a lift cabin in room `from` offers. A room with lift rows of its own offers exactly those, each behind its gate (a row whose room is not on the map is skipped).
 *  A room without any keeps the default: every open room, as given in `defaultOpen`. */
export function liftDestinations(from: string, links: readonly MapLink[], names: ReadonlyMap<string, string>, reached: ReadonlySet<string>, defaultOpen: readonly { slug: string; name: string }[]): { slug: string; name: string }[] {
  const own = links.filter((l) => l.kind === "lift" && l.fromSlug === from);
  if (!own.length) return [...defaultOpen];
  return own.filter((l) => (!l.gate || reached.has(l.gate)) && names.has(l.toSlug)).map((l) => ({ slug: l.toSlug, name: names.get(l.toSlug)! }));
}
