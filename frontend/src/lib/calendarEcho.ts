// The echo view (fix416, idea 6): the dates of a repeating series fade as they get further from today. The next date is at full
// strength, each one after it a little fainter, and the dates already past sit at the floor. One-off events are not in the map.
import type { Occurrence } from "./calendarRepeat";

export const ECHO_FLOOR = 0.3;
export const ECHO_STEP = 0.14;

/** The opacity of each repeated date, keyed by `${id}:${day}`. Only repeats are in the map; anything not in it is full strength. */
export function echoOpacity(events: Occurrence[], today: string): Map<string, number> {
  const series = new Map<number, string[]>();
  for (const e of events) {
    if (!e.repeated) continue;
    const days = series.get(e.id);
    if (days) days.push(e.day); else series.set(e.id, [e.day]);
  }
  const out = new Map<string, number>();
  for (const [id, days] of series) {
    const upcoming = days.filter((d) => d >= today).sort();
    upcoming.forEach((d, i) => out.set(`${id}:${d}`, Math.max(ECHO_FLOOR, 1 - ECHO_STEP * i)));
    for (const d of days) if (d < today) out.set(`${id}:${d}`, ECHO_FLOOR);
  }
  return out;
}
