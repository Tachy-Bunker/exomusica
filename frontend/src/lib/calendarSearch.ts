// The calendar's search (fix418, idea 5). The words match as they always did: every word typed, in the title, text, place or author.
// A day the search names narrows it to those days: a date ('12 nov', '2026-11-02', 'demain', 'tonight'), a weekday ('samedi', 'sat':
// every one in view), the weekend ('this weekend'), or a day that many days or weeks away ('in 2 weeks'). Pure: day keys in, no clock.
import type { CalEvent } from "./calendarApi";
import { filterEvents } from "./calendarFilter";
import { takeDate } from "./calendarQuickAdd";
import { addDays, parseKey } from "./calendarTime";

export interface SearchPlan {
  /** The days the search keeps; null when it names no day (every day is kept). */
  keep: ((day: string) => boolean) | null;
  /** The words left over: each must match, as the search always has. */
  words: string;
}

const WEEKEND = /(?<!\p{L})(?:this\s+weekend|ce\s+week-?end|week-?end|weekend)(?!\p{L})/iu;
const AHEAD = /(?<!\p{L})(?:in|dans)\s+(\d{1,3})\s*(days?|jours?|weeks?|semaines?)(?!\p{L})/iu;
// English short weekday names only. 'mon' is left out (it is 'my' in French); 'sam' and 'mar' are ordinary French words too.
const SHORT_WEEKDAY = /(?<!\p{L})(sun|tues?|wed|thu(?:rs?)?|fri|sat)(?!\p{L})/iu;
const SHORT: Record<string, number> = { sun: 0, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const weekdayOf = (key: string): number => new Date(key + "T12:00:00Z").getUTCDay();
const keyOf = (d: { y: number; m: number; d: number }): string => `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;

/** What the search names, and the words left over. An empty search keeps everything. `today` is the calendar's day key. */
export function planSearch(q: string, today: string): SearchPlan {
  let text = q.replace(/\s+/g, " ").trim();
  let keep: ((day: string) => boolean) | null = null;
  const cut = (m: RegExpExecArray) => { text = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length); };

  const wk = WEEKEND.exec(text);
  if (wk) {
    // The weekend of today: this Saturday and Sunday, or the one that is on now.
    const wd = weekdayOf(today);
    const sat = wd === 6 ? today : wd === 0 ? addDays(today, -1) : addDays(today, 6 - wd);
    const sun = addDays(sat, 1);
    keep = (d) => d === sat || d === sun;
    cut(wk);
  }
  if (!keep) {
    const ahead = AHEAD.exec(text);
    if (ahead) {
      const weeks = /^(weeks?|semaines?)$/i.test(ahead[2]);
      const day = addDays(today, Number(ahead[1]) * (weeks ? 7 : 1));
      keep = (d) => d === day;
      cut(ahead);
    }
  }
  if (!keep) {
    const dt = takeDate(text, parseKey(today));
    if (dt) {
      if (dt.weekday !== null) { const want = dt.weekday; keep = (d) => weekdayOf(d) === want; }
      else { const day = keyOf(dt.date); keep = (d) => d === day; }
      text = dt.text;
    }
  }
  if (!keep) {
    const sw = SHORT_WEEKDAY.exec(text);
    if (sw) { const want = SHORT[sw[1].toLowerCase()]; keep = (d) => weekdayOf(d) === want; cut(sw); }
  }
  return { keep, words: text.replace(/\s+/g, " ").trim() };
}

/** The events the search keeps: the days it names (if any), then the words left, which every event must contain. Before the page knows
 *  today (no day key yet), the search is the plain word search. */
export function searchEvents<T extends CalEvent & { day: string }>(events: T[], q: string, today: string): T[] {
  if (!ISO_DAY.test(today)) return filterEvents(events, q);
  const plan = planSearch(q, today);
  const keep = plan.keep;
  const days = keep ? events.filter((e) => keep(e.day)) : events;
  return plan.words ? filterEvents(days, plan.words) : days;
}
