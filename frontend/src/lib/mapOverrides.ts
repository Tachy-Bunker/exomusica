import { getJson } from "./sharedGet";
import type { MapOverride } from "./hullLayout";
/** Where the owner has moved rooms on the map (empty when nothing was moved or the request fails). */
export const loadMapOverrides = (): Promise<MapOverride[]> => getJson<MapOverride[]>("/api/map-overrides").then((r) => (Array.isArray(r) ? r : [])).catch(() => []);
