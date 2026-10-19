// Filters over the events a view has loaded: words, one place, only the ones with a picture. Pure.
import type { CalEvent } from "./calendarApi";

export interface Filter { q: string; place: string; withPicture: boolean }
export const EMPTY_FILTER: Filter = { q: "", place: "", withPicture: false };

export function filterEvents(events: CalEvent[], f: Filter): CalEvent[] {
  const q = f.q.trim().toLowerCase();
  return events.filter((e) =>
    (!f.place || e.location === f.place) &&
    (!f.withPicture || e.image !== null) &&
    (!q || `${e.title} ${e.text} ${e.location} ${e.addedBy}`.toLowerCase().includes(q)));
}

/** The places in these events, the busiest first, then by name. */
export function placesOf(events: CalEvent[]): { place: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) if (e.location) counts.set(e.location, (counts.get(e.location) ?? 0) + 1);
  return [...counts].map(([place, count]) => ({ place, count })).sort((a, b) => b.count - a.count || a.place.localeCompare(b.place));
}
