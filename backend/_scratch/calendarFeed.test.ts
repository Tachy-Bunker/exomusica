// fix420: the subscription feed (idea 10). Its event lines are the ones the single-event download writes (frontend icsOf), and its
// text, escaping, folding and key checks hold. Run with: npx tsx _scratch/calendarFeed.test.ts
import assert from "node:assert/strict";
import { escapeText, feedOf, fold, keyMatches, newFeedKey, veventLines, type FeedEvent } from "../src/lib/calendarFeed.js";
import { icsOf } from "../../frontend/src/lib/calendarIcs";
import type { CalEvent } from "../../frontend/src/lib/calendarApi";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; console.log("ok  ", m); };

const NOW = Date.parse("2026-10-20T10:00:00Z");
const UPDATED = "2026-10-19T08:00:00.000Z";
const base = (over: Partial<FeedEvent>): FeedEvent => ({
  id: 1, title: "Ambient set", text: "", url: null, location: "Le Trianon", startsAt: "2026-10-22T18:00:00.000Z", endsAt: null, allDay: false,
  lat: null, lng: null, recurrence: null, recurUntil: null, exdates: [], updatedAt: UPDATED, ...over,
});
/** The lines of the first VEVENT or VTIMEZONE block, unfolded. */
const block = (text: string, name: "VEVENT" | "VTIMEZONE"): string[] => {
  const raw = text.replace(/\r\n /g, "").split("\r\n");
  const from = raw.indexOf(`BEGIN:${name}`), to = raw.indexOf(`END:${name}`);
  return raw.slice(from, to + 1);
};

// ---- the event lines match the single-event download ----

const cases: Array<{ name: string; e: FeedEvent; tz: string }> = [
  { name: "a timed event in Paris", tz: "Europe/Paris", e: base({ endsAt: "2026-10-22T20:00:00.000Z", lat: 48.8836, lng: 2.334, url: "https://example.org/x", text: "Doors 19h; bring ID\nsecond line" }) },
  { name: "an all-day event", tz: "Europe/Paris", e: base({ allDay: true, startsAt: "2026-10-23T22:00:00.000Z", endsAt: "2026-10-24T21:59:00.000Z" }) },
  { name: "a weekly repeat with a last day and skipped days", tz: "Europe/Paris", e: base({ recurrence: "weekly", recurUntil: "2026-12-17", exdates: ["2026-11-05", "2026-11-26"] }) },
  { name: "a monthly repeat with no end", tz: "Europe/Paris", e: base({ recurrence: "monthly" }) },
  { name: "a yearly all-day repeat", tz: "Europe/Paris", e: base({ id: 5, recurrence: "yearly", allDay: true, startsAt: "2026-10-22T00:00:00.000Z", recurUntil: "2030-01-01", exdates: ["2027-10-22"] }) },
  { name: "a UTC calendar", tz: "UTC", e: base({ endsAt: null }) },
  { name: "separators in the title and place", tz: "Europe/Paris", e: base({ title: "Jam; night, \\ part", location: "Hall, 2", lat: 1, lng: -0.5 }) },
];
for (const c of cases) {
  const uid = `event-${c.e.id}.club@exomusica`;
  const want = block(icsOf(c.e as unknown as CalEvent, c.tz, { uid, now: NOW }), "VEVENT");
  const got = veventLines(c.e, c.tz, uid, NOW);
  assert.deepEqual(got, want, c.name);
  ok(true, `${c.name}: the same lines as the download`);
  n += 0;
}

// The zone block of the feed is the download's, for the same year.
const paris = feedOf([base({})], { slug: "club", name: "Club", timezone: "Europe/Paris" }, NOW);
assert.deepEqual(block(paris, "VTIMEZONE"), block(icsOf(base({}) as unknown as CalEvent, "Europe/Paris", { uid: "x", now: NOW }), "VTIMEZONE"));
ok(true, "the zone block is the download's zone block");
ok(paris.includes("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU") && paris.includes("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"), "Paris changes its clock on the last Sundays of March and October");

// ---- the whole feed ----

const empty = feedOf([], { slug: "club", name: "Club, Nights", timezone: "UTC" }, NOW);
ok(empty.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0") && empty.endsWith("END:VCALENDAR\r\n"), "an empty calendar is still a valid feed");
ok(!empty.includes("BEGIN:VTIMEZONE") && !empty.includes("BEGIN:VEVENT"), "UTC has no zone block, and an empty calendar no events");
ok(empty.includes("X-WR-CALNAME:Club\\, Nights"), "the calendar's name is escaped");
ok(empty.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H") && empty.includes("X-PUBLISHED-TTL:PT1H"), "apps are asked to check again within the hour");
ok(!/(^|[^\r])\n/.test(empty), "every line ends in CRLF, none in a bare LF");

const two = feedOf([base({ id: 1 }), base({ id: 2, title: "Second" })], { slug: "club", name: "Club", timezone: "Europe/Paris" }, NOW);
ok(two.split("BEGIN:VEVENT").length - 1 === 2, "one VEVENT per event");
ok(two.includes("UID:event-2.club@exomusica"), "each event keeps its own id in this calendar");

const long = feedOf([base({ title: "x".repeat(200), text: "é".repeat(80) })], { slug: "club", name: "Club", timezone: "UTC" }, NOW);
const physical = long.split("\r\n").filter(Boolean);
ok(physical.every((l) => Buffer.byteLength(l) <= 75), "every line is at most 75 octets");
const unfolded = long.replace(/\r\n /g, "");
ok(unfolded.includes("SUMMARY:" + "x".repeat(200)) && unfolded.includes("DESCRIPTION:" + "é".repeat(80)), "folding loses no text, and no character is cut in two");

// ---- text ----

ok(escapeText("a,b;c\\d\ne") === String.raw`a\,b\;c\\d\ne`, "commas, semicolons, backslashes and line breaks are escaped");
ok(fold("short") === "short", "a short line is left as it is");

// ---- the key ----

const k = newFeedKey();
ok(/^[A-Za-z0-9_-]{32}$/.test(k) && newFeedKey() !== k, "a key is 32 URL-safe characters, and a new one each time");
const changed = k.slice(0, -1) + (k.endsWith("a") ? "b" : "a");
ok(keyMatches(k, k) && !keyMatches(k, changed), "the same key matches, a changed one does not");
ok(!keyMatches(k, k + "x") && !keyMatches(k, k.slice(1)), "a longer or shorter key does not match");
ok(!keyMatches(null, k) && !keyMatches(k, undefined) && !keyMatches(k, "") && !keyMatches(k, 42), "no stored key, no given key or a key that is not text never matches");

console.log(`\n${n} checks pass`);
