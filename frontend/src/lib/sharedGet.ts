// One small cache for GETs that several parts of the page ask for around the same time (the room, its theme, a door being walked toward).
import { api } from "./api";
const TTL = 45_000;
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
/** A GET shared by everyone who asks within 45 s (a failure is forgotten at once). */
export function getJson<T>(path: string): Promise<T> {
  const hit = cache.get(path), now = Date.now();
  if (hit && now - hit.at < TTL) return hit.p as Promise<T>;
  const p = api<T>(path); cache.set(path, { at: now, p });
  p.catch(() => { if (cache.get(path)?.p === p) cache.delete(path); });
  return p;
}
export const clearShared = (): void => cache.clear();
