// The page's search and the places list (fix414: the place and picture filters are gone; the page has one search). Pure.
import type { CalEvent } from "./calendarApi";

/** The events whose title, text, place or author contain every word typed (ignoring case). An empty search keeps everything. */
export function filterEvents<T extends CalEvent>(events: T[], q: string): T[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return events;
  return events.filter((e) => {
    const hay = `${e.title} ${e.text} ${e.location} ${e.addedBy}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The places in these events, the busiest first, then by name. */
export function placesOf(events: CalEvent[]): { place: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) if (e.location) counts.set(e.location, (counts.get(e.location) ?? 0) + 1);
  return [...counts].map(([place, count]) => ({ place, count })).sort((a, b) => b.count - a.count || a.place.localeCompare(b.place));
}
