// Today and the places (fix418, ideas 1 and 4). Pure: the events arrive already expanded to their days (Occurrence) and the clock is
// passed in, so a test can fix the time. Both are a single pass over the list.
import type { Occurrence } from "./calendarRepeat";
import type { CalEvent } from "./calendarApi";
import { timeOf } from "./calendarTime";

/** How long a plain event with no end is taken to run, for the tonight strip: its start to three hours on. */
const NO_END_MS = 3 * 3_600_000;

/** "now": under way. "next": the first still to start. "over": done. "": later today, or an all-day event. */
export type Mark = "now" | "next" | "over" | "";
export interface TonightLine { e: Occurrence; mark: Mark }
export interface Tonight {
  /** Today's events in start order, each marked against the clock. */
  lines: TonightLine[];
  /** When no line is "next": the first event still to come, on any day (null when there is none in the loaded events). */
  after: Occurrence | null;
}

/** Today's events, marked against the clock, and the next event to come when today has none left to start. */
export function tonightOf(events: Occurrence[], today: string, nowMs: number): Tonight {
  const todays = events
    .filter((e) => e.day === today)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id);
  let nextTaken = false;
  const lines = todays.map((e): TonightLine => {
    if (e.allDay) return { e, mark: "" };
    const start = Date.parse(e.startsAt);
    const end = e.endsAt ? Date.parse(e.endsAt) : start + NO_END_MS;
    if (end <= nowMs) return { e, mark: "over" };
    if (start <= nowMs) return { e, mark: "now" };
    if (!nextTaken) { nextTaken = true; return { e, mark: "next" }; }
    return { e, mark: "" };
  });
  let after: Occurrence | null = null;
  if (!nextTaken) {
    let soonest = Infinity;
    for (const e of events) {
      const s = Date.parse(e.startsAt);
      if (s > nowMs && s < soonest) { soonest = s; after = e; }
    }
  }
  return { lines, after };
}

export interface Venue { place: string; upcoming: number; next: Occurrence }

/** The places still to come, each with how many events are at it and the first of them: the soonest place first. The name is matched
 *  without its case or spaces at the ends, so 'Glazart' and 'glazart ' are one place. */
export function venuesOf(events: Occurrence[], today: string): Venue[] {
  const byName = new Map<string, Venue>();
  for (const e of events) {
    const place = e.location.trim();
    if (!place || e.day < today) continue;
    const key = place.toLowerCase();
    const v = byName.get(key);
    if (!v) { byName.set(key, { place, upcoming: 1, next: e }); continue; }
    v.upcoming += 1;
    if (Date.parse(e.startsAt) < Date.parse(v.next.startsAt)) v.next = e;
  }
  return [...byName.values()].sort((a, b) =>
    Date.parse(a.next.startsAt) - Date.parse(b.next.startsAt) || b.upcoming - a.upcoming || a.place.localeCompare(b.place));
}

/** A place the calendar knows from its events (idea 15): its name as it was last written, its coordinates (from the latest event that
 *  had them), and the start it is most often at ("HH:MM" in the calendar's zone; a tie goes to the latest), or null when none of its
 *  timed events is there. */
export interface VenueMemo { name: string; lat: number | null; lng: number | null; start: string | null }

export function memoryOf(events: CalEvent[], tz: string): VenueMemo[] {
  const latest = [...events].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const seen = new Map<string, { name: string; lat: number | null; lng: number | null; counts: Map<string, number> }>();
  for (const e of latest) {
    const name = e.location.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    let v = seen.get(key);
    if (!v) { v = { name, lat: null, lng: null, counts: new Map() }; seen.set(key, v); }
    if (v.lat === null && e.lat !== null && e.lng !== null) { v.lat = e.lat; v.lng = e.lng; }
    if (!e.allDay) { const at = timeOf(e.startsAt, tz); v.counts.set(at, (v.counts.get(at) ?? 0) + 1); }
  }
  return [...seen.values()].map((v) => {
    let start: string | null = null;
    let top = 0;
    for (const [at, n] of v.counts) if (n > top) { top = n; start = at; } // first seen wins a tie: the latest
    return { name: v.name, lat: v.lat, lng: v.lng, start };
  });
}

/** The remembered place the typed text is, when it is one exactly (ignoring case and the spaces at its ends); null otherwise. */
export function venueNamed(venues: VenueMemo[], typed: string): VenueMemo | null {
  const key = typed.trim().toLowerCase();
  if (!key) return null;
  return venues.find((v) => v.name.toLowerCase() === key) ?? null;
}
