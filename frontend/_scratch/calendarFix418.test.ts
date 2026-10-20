// fix418: the search's dates, today's strip, the venue index and the remembered view. Pure. Today is Tuesday 20 October 2026.
// Run with: npx tsx _scratch/calendarFix418.test.ts
import assert from "node:assert/strict";
import type { Occurrence } from "../src/lib/calendarRepeat";
import { planSearch, searchEvents } from "../src/lib/calendarSearch";
import { tonightOf, venuesOf } from "../src/lib/calendarToday";
import { DEFAULT_VIEW, parseViewPrefs, readViewPrefs, writeViewPrefs } from "../src/lib/calendarView";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; console.log("ok  ", m); };
const TODAY = "2026-10-20";

// An occurrence as the page holds it: only the fields these functions read matter.
const ev = (id: number, title: string, day: string, extra: Partial<Occurrence> = {}): Occurrence => ({
  id, title, text: "", url: null, location: "", startsAt: `${day}T19:00:00Z`, endsAt: null, allDay: false, addedBy: "",
  lat: null, lng: null, recurrence: null, recurUntil: null, exdates: [], image: null, createdAt: "", updatedAt: "",
  day, repeated: false, ...extra,
}) as Occurrence;

const list: Occurrence[] = [
  ev(1, "Jazz night", "2026-10-24", { location: "Glazart" }),   // Saturday
  ev(2, "Ambient set", "2026-10-20", { location: "Le Trianon" }), // today
  ev(3, "Noise jam", "2026-10-25", { location: "Le Trianon" }),   // Sunday
  ev(4, "Drone", "2026-10-31"),                                  // Saturday
  ev(5, "Jazz brunch", "2026-11-12", { location: "Glazart" }),
  ev(6, "Concert", "2026-11-03"),                                // in 2 weeks
  ev(7, "Mon concert", "2026-10-22"),
  ev(8, "Sat jam", "2026-10-21"),                                // Wednesday, with 'sat' in its title
];
const ids = (xs: Occurrence[]) => xs.map((e) => e.id).sort((a, b) => a - b).join(",");

// Search: the words as before, and the days a search names.
ok(planSearch("", TODAY).keep === null && planSearch("", TODAY).words === "", "an empty search keeps everything");
ok(ids(searchEvents(list, "", TODAY)) === "1,2,3,4,5,6,7,8", "an empty search keeps every event");
ok(ids(searchEvents(list, "jazz", TODAY)) === "1,5", "the words still match as they did");
ok(ids(searchEvents(list, "samedi", TODAY)) === "1,4", "'samedi' is every Saturday in view");
ok(ids(searchEvents(list, "sat", TODAY)) === "1,4", "'sat' is every Saturday, and 'Sat jam' is not one of them");
ok(ids(searchEvents(list, "this weekend", TODAY)) === "1,3", "'this weekend' is the coming Saturday and Sunday (a Tuesday: 24 and 25 October)");
ok(ids(searchEvents(list, "weekend", "2026-10-25")) === "1,3", "on a Sunday the weekend is the Saturday before and today");
ok(ids(searchEvents(list, "in 2 weeks", TODAY)) === "6", "'in 2 weeks' is the day 14 days on");
ok(ids(searchEvents(list, "dans 2 jours", TODAY)) === "7", "'dans 2 jours' is two days on, in French");
ok(ids(searchEvents(list, "12 nov", TODAY)) === "5", "'12 nov' is that day");
ok(ids(searchEvents(list, "12 novembre", TODAY)) === "5", "'12 novembre' is that day, in French");
ok(ids(searchEvents(list, "2026-11-03", TODAY)) === "6", "an ISO day is that day");
ok(ids(searchEvents(list, "demain", TODAY)) === "8", "'demain' is tomorrow (Wednesday 21 October)");
ok(ids(searchEvents(list, "ce soir", TODAY)) === "2", "'ce soir' is today");
ok(ids(searchEvents(list, "tonight", TODAY)) === "2", "'tonight' is today");
ok(ids(searchEvents(list, "jazz samedi", TODAY)) === "1", "a word and a day together: the jazz on a Saturday");
ok(ids(searchEvents(list, "mon concert", TODAY)) === "7", "'mon' is a word here, not Monday");
ok(planSearch("v1.2", TODAY).keep === null, "a version number is not a day");
ok(planSearch("live 3 dec", TODAY).keep?.("2026-12-03") === true, "'3 dec' with no year is the next December the 3rd");
ok(ids(searchEvents(list, "jazz", "")) === "1,5", "before the page knows today, the search is the plain word search");

// Tonight: marked against the clock.
const now = Date.parse("2026-10-20T18:30:00Z");
const A = ev(10, "Early", "2026-10-20", { startsAt: "2026-10-20T16:00:00Z", endsAt: "2026-10-20T17:30:00Z" });
const B = ev(11, "Now", "2026-10-20", { startsAt: "2026-10-20T18:00:00Z", endsAt: "2026-10-20T20:00:00Z" });
const C = ev(12, "Later", "2026-10-20", { startsAt: "2026-10-20T20:30:00Z", endsAt: null });
const D = ev(13, "Day", "2026-10-20", { allDay: true, startsAt: "2026-10-20T00:00:00Z" });
const E = ev(14, "Tomorrow", "2026-10-21", { startsAt: "2026-10-21T10:00:00Z" });
const t1 = tonightOf([E, C, B, A, D], TODAY, now);
ok(t1.lines.map((l) => l.e.id).join(",") === "13,10,11,12", "today's events come in start order, the all-day one first");
ok(t1.lines.map((l) => l.mark).join(",") === ",over,now,next", "a finished event is 'over', one under way is 'now', the first to start is 'next'");
ok(t1.after === null, "when today has a next event, there is no 'after'");
const t2 = tonightOf([E, B, A, D], TODAY, now);
ok(t2.lines.map((l) => l.mark).join(",") === ",over,now", "with nothing left to start today, no line is 'next'");
ok(t2.after?.id === 14, "then the next event to come is named (tomorrow's)");
const t3 = tonightOf([E], TODAY, now);
ok(t3.lines.length === 0 && t3.after?.id === 14, "nothing today: the next event to come is named");
const noEnd = ev(15, "Started", "2026-10-20", { startsAt: "2026-10-20T17:00:00Z", endsAt: null });
const longAgo = ev(16, "Long ago", "2026-10-20", { startsAt: "2026-10-20T12:00:00Z", endsAt: null });
ok(tonightOf([noEnd, longAgo], TODAY, now).lines.map((l) => l.mark).join(",") === "over,now", "an event with no end runs three hours from its start");
ok(tonightOf([], TODAY, now).after === null, "an empty calendar has no 'after'");

// Venues: still to come, the soonest first, the same place in any case.
const V1 = ev(20, "Set", "2026-10-24", { location: "Le Trianon", startsAt: "2026-10-24T19:00:00Z" });
const V2 = ev(21, "Night", "2026-10-22", { location: "Glazart", startsAt: "2026-10-22T20:00:00Z" });
const V3 = ev(22, "Late", "2026-11-12", { location: "glazart ", startsAt: "2026-11-12T20:00:00Z" });
const V4 = ev(23, "Old", "2026-10-01", { location: "Old hall", startsAt: "2026-10-01T20:00:00Z" });
const V5 = ev(24, "No place", "2026-10-23", { location: "" });
const V6 = ev(25, "Again", "2026-10-30", { location: "Le Trianon", startsAt: "2026-10-30T19:00:00Z" });
const vs = venuesOf([V1, V2, V3, V4, V5, V6], TODAY);
ok(vs.length === 2, "a place with no events to come, and one with no name, are left out");
ok(vs[0].place === "Glazart" && vs[0].upcoming === 2 && vs[0].next.id === 21, "the soonest place first, with its count and its first event");
ok(vs[1].place === "Le Trianon" && vs[1].upcoming === 2 && vs[1].next.id === 20, "the next place, counted with the same name in any case");

// The remembered view: what was stored, checked; the default when it is not usable.
ok(parseViewPrefs(null).period === DEFAULT_VIEW.period && parseViewPrefs(null).mode === "list", "nothing stored: the default view");
ok(JSON.stringify(parseViewPrefs({ period: "week", custom: "5", mode: "sentences" })) === JSON.stringify({ period: "week", custom: "5", mode: "sentences" }), "a stored view comes back as it was");
const bad = parseViewPrefs({ period: "year", custom: "abc", mode: "x" });
ok(bad.period === "30" && bad.custom === "" && bad.mode === "list", "values out of shape fall back field by field");
ok(parseViewPrefs({ custom: "12345" }).custom === "", "a number of days with too many digits is not kept");
ok(parseViewPrefs("text").period === "30", "a value that is not an object is the default");
ok(readViewPrefs("x").period === "30", "with no storage (as in a test run), the default view");
ok((() => { try { writeViewPrefs("x", { period: "week", custom: "", mode: "list" }); return true; } catch { return false; } })(), "writing with no storage does not throw");

console.log(`\n${n} checks pass`);
