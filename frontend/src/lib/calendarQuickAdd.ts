// The one-line add for calendars: "X à Y le 12 novembre à 20h", "Ambient set at Le Trianon, 2 Nov 20:00", "Vernissage demain 18h30 chez Léa",
// "Live samedi de 20h à 23h au Glazart", or a line with a link in it. French first, English too. Pure: no clock and no zone here.
// The caller passes today's date in the calendar's zone, and turns the result into an instant with zonedToUtc.
// fix418: the date reading is its own function (takeDate), so the calendar's search reads dates the same way.

export interface Ymd { y: number; m: number; d: number }
export interface QuickAdd {
  title: string;
  location: string;
  url: string | null;
  date: Ymd | null;      // null: the line names no date, so the form keeps the day it has
  start: string | null;  // "HH:MM", 24 hours
  end: string | null;
  ok: boolean;           // a title was found
}
/** A date a line names: the day, the weekday number when the line named only a weekday (0 = Sunday), and the line without that date. */
export interface TakenDate { date: Ymd; weekday: number | null; text: string }

const MAX_LINE = 300;

// Month and day words without accents or dots, in lower case: both languages, the short forms too.
const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = { // 0 = Sunday, as Date.getUTCDay
  dimanche: 0, sunday: 0, lundi: 1, monday: 1, mardi: 2, tuesday: 2, mercredi: 3, wednesday: 3,
  jeudi: 4, thursday: 4, vendredi: 5, friday: 5, samedi: 6, saturday: 6,
};
const plain = (w: string): string => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ.’']/g, "");

const RE_URL = /https?:\/\/\S+/i;
const RE_ISO = /(?<!\p{N})(\d{4})-(\d{1,2})-(\d{1,2})(?!\p{N})/u;
const RE_DAY_MONTH = /(?<!\p{L}\p{N})(?:(?:le|on)\s+)?(\d{1,2})(?:er|st|nd|rd|th)?\s+(?:de\s+)?(\p{L}+\.?)(?:\s+(\d{4}))?(?![\p{L}\p{N}])/giu;
const RE_MONTH_DAY = /(?<!\p{L}\p{N})(\p{L}+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?!\p{N})/giu;
// A number stuck to a word ('v1.2') is not a day: the day and month must stand apart.
const RE_DMY = /(?<![\p{L}\p{N}])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?(?!\p{N})/u;
const RE_RELATIVE = /(?<!\p{L})(aujourd['’]?hui|ce\s+soir|ce\s+matin|today|tonight|demain|tomorrow|apr[eè]s-?demain|after\s*tomorrow)(?!\p{L})/iu;
const RE_WEEKDAY = /(?<!\p{L})(?:ce\s+|this\s+|next\s+|prochain\s+|prochaine\s+|le\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?!\p{L})/iu;
// am/pm first, so '7:30 pm' is not read as 07:30 with a stray 'pm' left behind.
const RE_TIME = /(?<![\p{L}\p{N}])(?:(?:à|at|@|de|from|dès|vers)\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?|(\d{1,2})(?::|h|H)(\d{2})?)(?![\p{L}\p{N}])/giu;
// A plain preposition only: an article stays with the place ('à La Cigale' keeps 'La Cigale').
// A line may start with 'at X' or 'chez X' (no title yet), but not with 'au' or 'à': those start real titles.
const RE_SEPARATOR = /(?:^(?:at|@|chez)|\s+(?:à|au|aux|chez|in|at|@))\s+|\s+[-–—]\s+/iu;
const TRIM = /^[\s,;:.|–—-]+|[\s,;:.|–—-]+$/g;

const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
const ymdOf = (t: number): Ymd => { const dt = new Date(t); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; };
const DAY = 86_400_000;

/** A calendar date that exists; without a year, the next one that is not more than a day past. Null for 31 February and such. */
function resolve(d: number, m: number, y: number | undefined, today: Ymd): Ymd | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t0 = utc(today.y, today.m, today.d);
  let year = y ?? today.y;
  if (y === undefined && utc(year, m, d) < t0 - DAY) year += 1;
  const t = utc(year, m, d);
  return ymdOf(t).d === d && ymdOf(t).m === m ? { y: year, m, d } : null;
}

function hm(h: number, min: number): string | null {
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
}

/** The date a line names, and the line with that date taken out. The first kind found wins, in this order: a full date, a day and a
 *  month, a month and a day, a day/month number, 'today' or 'tomorrow', then a weekday (the next one; `weekday` is then its number, so
 *  a search can take every one of them). Null when the line names no real day. */
export function takeDate(line: string, today: Ymd): TakenDate | null {
  let t = line;
  const cut = (m: RegExpExecArray | RegExpMatchArray) => { t = t.slice(0, m.index) + " " + t.slice((m.index ?? 0) + m[0].length); };

  const iso = RE_ISO.exec(t);
  if (iso) {
    const got = resolve(Number(iso[3]), Number(iso[2]), Number(iso[1]), today);
    if (!got) return null;
    cut(iso);
    return { date: got, weekday: null, text: t };
  }
  for (const m of t.matchAll(RE_DAY_MONTH)) {
    const mon = MONTHS[plain(m[2])];
    if (!mon) continue;
    const got = resolve(Number(m[1]), mon, m[3] ? Number(m[3]) : undefined, today);
    if (got) return { date: got, weekday: null, text: t.replace(m[0], " ") };
    break;
  }
  for (const m of t.matchAll(RE_MONTH_DAY)) {
    const mon = MONTHS[plain(m[1])];
    if (!mon) continue;
    const got = resolve(Number(m[2]), mon, m[3] ? Number(m[3]) : undefined, today);
    if (got) return { date: got, weekday: null, text: t.replace(m[0], " ") };
    break;
  }
  const dmy = RE_DMY.exec(t);
  if (dmy) {
    const yr = dmy[3] === undefined ? undefined : Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const got = resolve(Number(dmy[1]), Number(dmy[2]), yr, today);
    if (got) { cut(dmy); return { date: got, weekday: null, text: t }; }
  }
  const rel = RE_RELATIVE.exec(t);
  if (rel) {
    const w = plain(rel[1]).replace(/\s+/g, "");
    const days = /apres?demain|aftertomorrow/.test(w) ? 2 : /demain|tomorrow/.test(w) ? 1 : 0;
    cut(rel);
    return { date: ymdOf(utc(today.y, today.m, today.d) + days * DAY), weekday: null, text: t };
  }
  const wd = RE_WEEKDAY.exec(t);
  if (wd) {
    const want = WEEKDAYS[plain(wd[1])];
    const base = utc(today.y, today.m, today.d);
    const todayWd = new Date(base).getUTCDay();
    cut(wd);
    return { date: ymdOf(base + ((want - todayWd + 7) % 7) * DAY), weekday: want, text: t };
  }
  return null;
}

/** One line, as the owner types it. */
export function parseQuickAdd(line: string, today: Ymd): QuickAdd {
  const out: QuickAdd = { title: "", location: "", url: null, date: null, start: null, end: null, ok: false };
  let t = String(line ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LINE);
  if (!t) return out;

  const url = RE_URL.exec(t);
  if (url) { out.url = url[0].replace(/[),.;]+$/, ""); t = t.replace(url[0], " "); }

  // The date: only the text it names is taken out of the title.
  const dt = takeDate(t, today);
  if (dt) { out.date = dt.date; t = dt.text; }

  // The times: the first is the start, a second one the end ("de 20h à 23h", "20h-23h"). The leading word goes with it.
  const times: { h: number; m: number; at: RegExpMatchArray }[] = [];
  for (const m of t.matchAll(RE_TIME)) {
    let h: number, min: number;
    if (m[3] !== undefined) { h = Number(m[1]) % 12 + (m[3].toLowerCase() === "p" ? 12 : 0); min = Number(m[2] ?? 0); }
    else { h = Number(m[4]); min = Number(m[5] ?? 0); }
    if (hm(h, min) === null) continue;
    times.push({ h, m: min, at: m });
    if (times.length === 2) break;
  }
  if (times[0]) { out.start = hm(times[0].h, times[0].m); }
  if (times[1]) { out.end = hm(times[1].h, times[1].m); }
  for (const x of times) t = t.replace(x.at[0], " ");

  // Title and place: the first separator ("X at X", "X à Y", "X au Y", "X chez Y", "X - Y").
  const sep = RE_SEPARATOR.exec(t);
  const title = sep ? t.slice(0, sep.index) : t;
  const place = sep ? t.slice(sep.index + sep[0].length) : "";
  out.title = title.replace(TRIM, "").replace(/\s+/g, " ");
  out.location = place.replace(TRIM, "").replace(/\s+/g, " ");
  out.ok = out.title.length > 0;
  return out;
}
