// Repeats (fix414). A repeating event is stored once; this turns it into the days it falls on inside a window of time. Pure: day keys,
// the calendar's zone, no DOM. A repeat keeps its clock time in the calendar's zone (a weekly 19:00 stays 19:00 across a clock change).
// A monthly or yearly repeat skips the periods that have no such day (a 31st in a 30-day month, a 29 February in a common year).
import { addDays, dayKey, parseKey, timeOf, zonedToUtc } from "./calendarTime";
import type { CalEvent, Recurrence } from "./calendarApi";

/** One day an event falls on. `id` is the event's (its series, for a repeat); `repeated` says it is one day of a repeat. */
export interface Occurrence extends CalEvent { day: string; repeated: boolean }

/** A guard for weak devices: no series gives more days than this in one window (the longest view is about 400 days). */
const MAX_PER_SERIES = 800;
const DAY = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/** How many periods (days, weeks, months or years) lie from the first day to `day`. */
function periodsBetween(base: string, rec: Recurrence, day: string): number {
  if (rec === "daily") return daysBetween(base, day);
  if (rec === "weekly") return Math.floor(daysBetween(base, day) / 7);
  const a = parseKey(base), b = parseKey(day);
  if (rec === "monthly") return (b.y * 12 + b.m) - (a.y * 12 + a.m);
  return b.y - a.y;
}

/** The day of the k-th period of a repeat, or null when that period has no such day. */
function dayAt(base: string, rec: Recurrence, k: number): string | null {
  if (rec === "daily") return addDays(base, k);
  if (rec === "weekly") return addDays(base, 7 * k);
  const { y, m, d } = parseKey(base);
  if (rec === "monthly") {
    const total = m - 1 + k;
    const yy = y + Math.floor(total / 12), mm = (((total % 12) + 12) % 12) + 1;
    return d <= daysIn(yy, mm) ? keyOf(yy, mm, d) : null;
  }
  return d <= daysIn(y + k, m) ? keyOf(y + k, m, d) : null;
}

/** Every day an event falls on inside [from, to) (ISO instants). A plain event is itself when it overlaps the window; a repeat gives
 *  one entry per day it falls on, minus the skipped days, up to its last day. Returned in time order. */
export function occurrencesIn(events: CalEvent[], from: string, to: string, tz: string): Occurrence[] {
  const fromMs = Date.parse(from), toMs = Date.parse(to);
  const fromDay = dayKey(new Date(fromMs), tz), toDay = dayKey(new Date(toMs - 1), tz);
  const out: Occurrence[] = [];
  for (const e of events) {
    const start = Date.parse(e.startsAt);
    const span = e.endsAt ? Math.max(0, Date.parse(e.endsAt) - start) : 0;
    if (!e.recurrence) {
      if (start < toMs && start + span >= fromMs) out.push({ ...e, day: dayKey(new Date(start), tz), repeated: false });
      continue;
    }
    const rec = e.recurrence;
    const base = dayKey(new Date(start), tz);
    const [hh, mm] = timeOf(new Date(start), tz).split(":").map(Number);
    const skipped = new Set(e.exdates);
    const first = Math.max(0, periodsBetween(base, rec, fromDay) - 1);
    const last = periodsBetween(base, rec, toDay) + 1;
    let count = 0;
    for (let k = first; k <= last && count < MAX_PER_SERIES; k++) {
      const day = dayAt(base, rec, k);
      if (day === null || day < base || day > toDay) continue;
      if (e.recurUntil && day > e.recurUntil) break;
      if (skipped.has(day)) continue;
      const p = parseKey(day);
      const at = zonedToUtc(p.y, p.m, p.d, hh, mm, tz).getTime();
      if (at < toMs && at + span >= fromMs) {
        out.push({
          ...e, day, repeated: true,
          startsAt: new Date(at).toISOString(),
          endsAt: e.endsAt ? new Date(at + span).toISOString() : null,
        });
        count += 1;
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id);
}
