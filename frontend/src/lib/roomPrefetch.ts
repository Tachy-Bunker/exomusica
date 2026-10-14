// Walking toward a door fetches the room behind it, so it is there when the door opens. The same small cache serves the page itself.
import { getJson, clearShared } from "./sharedGet";
import { themeOf } from "./headerTheme";

const MAX_IN_FLIGHT = 3;
let inflight = 0;
const started = new Set<string>();
/** Fetch what the room of `slug` needs. Once per room per visit, never more than three at a time, and not at all on data-saver. */
export function prefetchRoom(slug: string): boolean {
  if (started.has(slug) || inflight >= MAX_IN_FLIGHT) return false;
  const nav = (typeof navigator !== "undefined" ? navigator : null) as (Navigator & { connection?: { saveData?: boolean } }) | null;
  if (nav?.connection?.saveData) return false;
  started.add(slug); inflight++;
  const done = () => { inflight = Math.max(0, inflight - 1); };
  Promise.allSettled([getJson(`/api/branches/${slug}`), getJson(`/api/branches/${slug}/albums`), themeOf(slug)]).then(done, done);
  return true;
}
export function resetPrefetch(): void { clearShared(); started.clear(); inflight = 0; }
