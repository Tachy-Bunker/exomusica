// The subscription feed (fix420, idea 10): a whole calendar as one .ics file, which a phone's or a computer's calendar app keeps in step
// with the site. The rules are those of the single-event download (frontend lib/calendarIcs.ts and lib/calendarTime.ts): the zone's
// daylight-saving rules as a VTIMEZONE, a repeat as its rule with its last day and its skipped days, text escaped, lines folded at 75
// octets. The zone helpers are copied here because the frontend and the backend are built apart; _scratch/calendarFeed.test.ts checks
// that both write the same event lines. Pure except for the key: no database, no request.
import { randomBytes, timingSafeEqual } from "node:crypto";

export type FeedRecurrence = "daily" | "weekly" | "monthly" | "yearly";
/** One event as the feed needs it: the ISO instants, the zone's day keys ("YYYY-MM-DD") for the repeat's last day and skipped days. */
export interface FeedEvent {
  id: number; title: string; text: string; url: string | null; location: string;
  startsAt: string; endsAt: string | null; allDay: boolean;
  lat: number | null; lng: number | null;
  recurrence: FeedRecurrence | null; recurUntil: string | null; exdates: string[];
  updatedAt: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQ: Record<FeedRecurrence, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };

// ---- the zone's clock (Intl only) ----

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The wall clock of an instant in a zone, as its parts. */
function partsOf(ms: number, tz: string): Record<string, number> {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return p;
}
/** The zone's offset from UTC at an instant, in minutes (east is plus). */
function offsetMinutes(ms: number, tz: string): number {
  const p = partsOf(ms, tz);
  const whole = Math.floor(ms / 1000) * 1000;
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole) / 60_000);
}
const dayKeyOf = (ms: number, tz: string): string => { const p = partsOf(ms, tz); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; };
const timeOfMs = (ms: number, tz: string): string => { const p = partsOf(ms, tz); return `${pad(p.hour)}:${pad(p.minute)}`; };
/** The instant at which the wall clock in `tz` shows y-m-d hh:mm. Two passes, so a clock change in between is right too. */
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const offset = (t: number): number => {
    const p = partsOf(t, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offset(guess);
  return guess - offset(first);
}
const addDays = (key: string, n: number): string => new Date(Date.parse(key + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const parseKey = (key: string): { y: number; m: number; d: number } => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)), d: Number(key.slice(8, 10)) });

// ---- iCalendar text ----

/** "20261031T023000Z" for an instant. */
const utcStamp = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
/** The wall clock of an instant in a zone, as an iCalendar local time: "20261031T023000". */
const localStamp = (ms: number, tz: string): string => utcStamp(ms + offsetMinutes(ms, tz) * 60_000).slice(0, -1);
/** "+0200" for a number of minutes. */
const offsetText = (min: number): string => `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

interface Change { at: number; from: number; to: number }
/** The moments in a year when the zone's offset changes: found a day at a time, then to the quarter hour. */
function changesIn(tz: string, year: number): Change[] {
  const out: Change[] = [];
  const noon = (i: number): number => Date.UTC(year, 0, 1 + i, 12);
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
  let prev = offsetMinutes(noon(0), tz);
  for (let i = 1; i < days; i++) {
    const cur = offsetMinutes(noon(i), tz);
    if (cur === prev) continue;
    let at = noon(i);
    for (let s = 0; s <= 96; s++) {
      const t = noon(i - 1) + s * 900_000;
      if (offsetMinutes(t, tz) !== prev) { at = t; break; }
    }
    out.push({ at, from: prev, to: cur });
    prev = cur;
  }
  return out;
}

/** One change as a yearly rule: its wall clock in the offset before it, and the weekday of its month (the first, second ... or last). */
function ruleOf(c: Change): { kind: "DAYLIGHT" | "STANDARD"; start: string; rrule: string; from: number; to: number } {
  const w = new Date(c.at + c.from * 60_000);
  const y = w.getUTCFullYear(), m = w.getUTCMonth() + 1, d = w.getUTCDate();
  const monthDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nth = d + 7 > monthDays ? -1 : Math.ceil(d / 7);
  return {
    kind: c.to > c.from ? "DAYLIGHT" : "STANDARD",
    start: `${y}${pad(m)}${pad(d)}T${pad(w.getUTCHours())}${pad(w.getUTCMinutes())}00`,
    rrule: `FREQ=YEARLY;BYMONTH=${m};BYDAY=${nth}${WEEKDAYS[w.getUTCDay()]}`,
    from: c.from, to: c.to,
  };
}

/** The zone as a VTIMEZONE block: one rule per change, or one fixed offset when the zone has no changes. */
function timezoneLines(tz: string, year: number): string[] {
  const lines = ["BEGIN:VTIMEZONE", `TZID:${tz}`];
  const changes = changesIn(tz, year);
  if (!changes.length) {
    const off = offsetText(offsetMinutes(Date.UTC(year, 0, 1, 12), tz));
    lines.push("BEGIN:STANDARD", `DTSTART:${year}0101T000000`, `TZOFFSETFROM:${off}`, `TZOFFSETTO:${off}`, "END:STANDARD");
  }
  for (const c of changes) {
    const r = ruleOf(c);
    lines.push(`BEGIN:${r.kind}`, `TZOFFSETFROM:${offsetText(r.from)}`, `TZOFFSETTO:${offsetText(r.to)}`, `DTSTART:${r.start}`, `RRULE:${r.rrule}`, `END:${r.kind}`);
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

/** Text values: a backslash, a comma, a semicolon or a line break is escaped (RFC 5545, section 3.3.11). */
export const escapeText = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

const octets = (ch: string): number => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};
/** A line is at most 75 octets: a longer one is cut, and the rest starts with a space. A cut never splits a character. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "", used = 0;
  for (const ch of line) {
    const n = octets(ch);
    if (used + n > 75) { out.push(cur); cur = " "; used = 1; }
    cur += ch; used += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** The lines of one VEVENT. A repeat is written as its series: its rule, its last day and the days left out. Same rules as icsOf. */
export function veventLines(e: FeedEvent, tz: string, uid: string, now: number): string[] {
  const start = Date.parse(e.startsAt);
  const endMs = e.endsAt ? Date.parse(e.endsAt) : null;
  const utc = tz === "UTC";
  const startDay = dayKeyOf(start, tz);
  const ymd = (k: string): string => k.replace(/-/g, "");
  const hm = timeOfMs(start, tz).split(":").map(Number);
  const link = e.url && /^https?:\/\//i.test(e.url) ? e.url : null;

  const stampLine = (name: string, ms: number): string =>
    e.allDay ? `${name};VALUE=DATE:${ymd(dayKeyOf(ms, tz))}` : utc ? `${name}:${utcStamp(ms)}` : `${name};TZID=${tz}:${localStamp(ms, tz)}`;

  const end = e.allDay
    ? `DTEND;VALUE=DATE:${ymd(addDays(endMs !== null ? dayKeyOf(endMs, tz) : startDay, 1))}`
    : stampLine("DTEND", endMs !== null && endMs > start ? endMs : start + 3_600_000);

  const rule: string[] = [];
  if (e.recurrence) {
    let r = `RRULE:FREQ=${FREQ[e.recurrence]}`;
    if (e.recurUntil) {
      if (e.allDay) r += `;UNTIL=${ymd(e.recurUntil)}`;
      else {
        const p = parseKey(e.recurUntil);
        r += `;UNTIL=${utcStamp(zonedToUtc(p.y, p.m, p.d, hm[0], hm[1], tz))}`;
      }
    }
    rule.push(r);
    for (const k of e.exdates) {
      if (e.allDay) rule.push(`EXDATE;VALUE=DATE:${ymd(k)}`);
      else {
        const p = parseKey(k);
        rule.push(stampLine("EXDATE", zonedToUtc(p.y, p.m, p.d, hm[0], hm[1], tz)));
      }
    }
  }

  const description = [e.text.trim(), link ?? ""].filter(Boolean).join("\n\n");
  const updated = Date.parse(e.updatedAt);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(Number.isNaN(updated) ? now : updated)}`,
    stampLine("DTSTART", start),
    end,
    ...rule,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.lat !== null && e.lng !== null ? [`GEO:${e.lat.toFixed(6)};${e.lng.toFixed(6)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(link ? [`URL:${link}`] : []),
    "END:VEVENT",
  ];
}

/** The whole feed: the calendar's name and refresh hints, its zone, and every event (the server caps how many). */
export function feedOf(events: FeedEvent[], cal: { slug: string; name: string; timezone: string }, now: number): string {
  const tz = cal.timezone;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Exomusica//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  if (tz !== "UTC") lines.push(...timezoneLines(tz, new Date(now).getUTCFullYear()));
  for (const e of events) lines.push(...veventLines(e, tz, `event-${e.id}.${cal.slug}@exomusica`, now));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---- the key that opens a protected calendar's feed ----

/** A new key for the subscription link: 24 random bytes, in URL-safe letters. */
export const newFeedKey = (): string => randomBytes(24).toString("base64url");

/** Whether the key in the link is the calendar's. No key stored, or none given, is never a match. Compared in constant time. */
export function keyMatches(stored: string | null, given: unknown): boolean {
  if (!stored || typeof given !== "string" || given.length === 0) return false;
  const a = Buffer.from(stored), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
