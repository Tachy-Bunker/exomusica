// Add to calendar (fix415): an event as an .ics file, which the phone's or the computer's calendar app takes in. The calendar's own zone
// goes in with its daylight-saving rules (a VTIMEZONE), so a weekly 19:00 stays 19:00 through the clock changes. A repeat keeps its
// days, its last day and its skipped days. The text is built here, without the DOM; the download is the last function.
import type { CalEvent, Recurrence } from "./calendarApi";
import { addDays, dayKey, parseKey, timeOf, zonedToUtc } from "./calendarTime";

const pad = (n: number): string => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQ: Record<Recurrence, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The zone's offset from UTC at an instant, in minutes (east is plus). */
export function offsetMinutes(ms: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const whole = Math.floor(ms / 1000) * 1000;
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole) / 60_000);
}

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
function fold(line: string): string {
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

export interface IcsOptions {
  /** Stable for the event, so a second download updates the same entry in the calendar app. */
  uid: string;
  now?: number;
}

/** The whole .ics text of one event. A repeat is written as its series: its rule, its last day and the days left out. */
export function icsOf(e: CalEvent, tz: string, opts: IcsOptions): string {
  const now = opts.now ?? Date.now();
  const start = Date.parse(e.startsAt);
  const endMs = e.endsAt ? Date.parse(e.endsAt) : null;
  const utc = tz === "UTC";
  const startDay = dayKey(start, tz);
  const ymd = (k: string): string => k.replace(/-/g, "");
  const hm = timeOf(start, tz).split(":").map(Number);
  const link = e.url && /^https?:\/\//i.test(e.url) ? e.url : null;

  /** A date-time line for an instant: a floating date for an all-day event, else the zone's local time (or UTC). */
  const stampLine = (name: string, ms: number): string =>
    e.allDay ? `${name};VALUE=DATE:${ymd(dayKey(ms, tz))}` : utc ? `${name}:${utcStamp(ms)}` : `${name};TZID=${tz}:${localStamp(ms, tz)}`;

  const end = e.allDay
    ? `DTEND;VALUE=DATE:${ymd(addDays(endMs !== null ? dayKey(endMs, tz) : startDay, 1))}`
    : stampLine("DTEND", endMs !== null && endMs > start ? endMs : start + 3_600_000);

  const rule: string[] = [];
  if (e.recurrence) {
    let r = `RRULE:FREQ=${FREQ[e.recurrence]}`;
    if (e.recurUntil) {
      if (e.allDay) r += `;UNTIL=${ymd(e.recurUntil)}`;
      else {
        const p = parseKey(e.recurUntil);
        r += `;UNTIL=${utcStamp(zonedToUtc(p.y, p.m, p.d, hm[0], hm[1], tz).getTime())}`;
      }
    }
    rule.push(r);
    for (const k of e.exdates) {
      if (e.allDay) rule.push(`EXDATE;VALUE=DATE:${ymd(k)}`);
      else {
        const p = parseKey(k);
        rule.push(stampLine("EXDATE", zonedToUtc(p.y, p.m, p.d, hm[0], hm[1], tz).getTime()));
      }
    }
  }

  const description = [e.text.trim(), link ?? ""].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Exomusica//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...(!e.allDay && !utc ? timezoneLines(tz, Number(startDay.slice(0, 4))) : []),
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(Number.isNaN(Date.parse(e.updatedAt)) ? now : Date.parse(e.updatedAt))}`,
    stampLine("DTSTART", start),
    end,
    ...rule,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.lat !== null && e.lng !== null ? [`GEO:${e.lat.toFixed(6)};${e.lng.toFixed(6)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(link ? [`URL:${link}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The file's name: the title in plain letters and figures. */
export function icsName(e: CalEvent): string {
  const base = e.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "event"}.ics`;
}

/** Downloads the text as a file: the phone or the computer then offers it to its calendar app. */
export function downloadIcs(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
