// Calendar time: the wall clock of a calendar's own zone, with Intl only (no library). Day keys are "YYYY-MM-DD".
// Formatters are made once per zone, not per event, so a long list costs one formatter.

const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(kind: "day" | "time" | "parts", tz: string): Intl.DateTimeFormat {
  const k = kind + "|" + tz;
  let f = formatters.get(k);
  if (!f) {
    f = kind === "day" ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      : kind === "time" ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      : new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(k, f);
  }
  return f;
}

/** The calendar day of an instant, in the zone: "YYYY-MM-DD". */
export const dayKey = (when: string | Date | number, tz: string): string => fmt("day", tz).format(new Date(when));
/** The clock time of an instant, in the zone: "HH:MM". */
export const timeOf = (when: string | Date | number, tz: string): string => fmt("time", tz).format(new Date(when));
/** Today's day key in the zone. */
export const todayKey = (tz: string): string => dayKey(Date.now(), tz);

const keyOf = (t: number): string => new Date(t).toISOString().slice(0, 10);
const stamp = (key: string): number => Date.parse(key + "T00:00:00Z");
/** A day key moved by n days (pure calendar arithmetic, no zone). */
export const addDays = (key: string, n: number): string => keyOf(stamp(key) + n * DAY);
/** Monday of the week that holds the key (weeks start on Monday). */
export const weekStart = (key: string): string => addDays(key, -((new Date(stamp(key)).getUTCDay() + 6) % 7));
/** The six weeks a month grid shows, from the Monday on or before the 1st: 42 day keys. */
export function monthCells(year: number, month: number): string[] {
  const first = weekStart(`${year}-${String(month).padStart(2, "0")}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
/** The day key's month, "YYYY-MM", for the header of a month grid. */
export const monthOf = (key: string): string => key.slice(0, 7);
export const parseKey = (key: string): { y: number; m: number; d: number } => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)), d: Number(key.slice(8, 10)) });

/** The instant at which the wall clock in `tz` shows y-m-d hh:mm. Two passes, so a daylight-saving change in between is right too. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const f = fmt("parts", tz);
  const offset = (t: number): number => {
    const p: Record<string, number> = {};
    for (const part of f.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}
/** The UTC instant at which a day key starts in the zone (00:00 local). */
export function dayStartIso(key: string, tz: string): string {
  const { y, m, d } = parseKey(key);
  return zonedToUtc(y, m, d, 0, 0, tz).toISOString();
}

/** "Wednesday 12 November 2026 · 20:00 – 23:00", or "· all day" (in `allDayText`). Dates follow the calendar's language (`locale`); the times are in its zone. */
export function whenText(startsAt: string, endsAt: string | null, allDay: boolean, tz: string, locale: string, allDayText: string): string {
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(startsAt));
  if (allDay) return `${day} · ${allDayText}`;
  const end = endsAt ? ` – ${timeOf(endsAt, tz)}` : "";
  return `${day} · ${timeOf(startsAt, tz)}${end}`;
}
/** A day key's label, read in UTC so no zone can move it to the day before. */
export function dayLabel(key: string, style: Intl.DateTimeFormatOptions, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...style }).format(new Date(key + "T12:00:00Z"));
}
