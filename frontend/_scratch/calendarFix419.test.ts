// fix419: venue memory (idea 15) and the keys on the page (idea 8). Pure. Run with: npx tsx _scratch/calendarFix419.test.ts
import assert from "node:assert/strict";
import type { CalEvent } from "../src/lib/calendarApi";
import { memoryOf, venueNamed } from "../src/lib/calendarToday";
import { dayStepOf, isTyping } from "../src/lib/calendarKeys";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; console.log("ok  ", m); };
// Paris is on summer time until 25 October 2026: 18:00 UTC is 20:00 in Paris, 19:00 UTC is 21:00.
const ev = (id: number, location: string, startsAt: string, extra: Partial<CalEvent> = {}): CalEvent => ({
  id, title: "t", text: "", url: null, location, startsAt, endsAt: null, allDay: false, addedBy: "",
  lat: null, lng: null, recurrence: null, recurUntil: null, exdates: [], image: null, createdAt: "", updatedAt: "", ...extra,
}) as CalEvent;
const TZ = "Europe/Paris";

const events: CalEvent[] = [
  ev(1, "Glazart", "2026-10-22T19:00:00Z", { lat: 48.89, lng: 2.37 }),   // 21:00, with coordinates
  ev(2, "glazart ", "2026-10-15T19:00:00Z"),                              // 21:00, no coordinates, another spelling
  ev(3, "Glazart", "2026-10-08T18:00:00Z"),                               // 20:00
  ev(4, "Studio", "2026-10-20T16:00:00Z"),                                // 18:00 Paris
  ev(5, "Studio", "2026-10-21T17:00:00Z"),                                // 19:00 Paris: a tie, so the latest wins
  ev(6, "Hall", "2026-10-23T22:00:00Z", { allDay: true }),                // all day: its clock is not counted
  ev(7, "Hall", "2026-10-24T18:00:00Z"),                                  // 20:00
  ev(8, "   ", "2026-10-24T18:00:00Z"),                                   // no place: not remembered
];
const memo = memoryOf(events, TZ);
const glaz = memo.find((v) => v.name.toLowerCase() === "glazart");
const studio = memo.find((v) => v.name === "Studio");
const hall = memo.find((v) => v.name === "Hall");
ok(memo.length === 3 && !memo.some((v) => v.name.trim() === ""), "a place is remembered once, and a blank place is not one");
ok(glaz?.start === "21:00", "the usual start is the one it is most often at (21:00, not 20:00)");
ok(glaz?.lat === 48.89 && glaz?.lng === 2.37, "its coordinates come from the latest event that has them");
ok(glaz?.name === "Glazart", "its name is the latest spelling");
ok(studio?.start === "19:00", "a tie in the usual start goes to the latest event");
ok(hall?.start === "20:00", "an all-day event does not count toward the usual start");
ok(hall?.lat === null, "a place with no coordinates anywhere is remembered without them");
ok(memoryOf([], TZ).length === 0, "no events, no places");

const venues = memoryOf(events, TZ);
ok(venueNamed(venues, "  glazart ")?.lat === 48.89, "a typed place matches a remembered one ignoring case and the spaces at its ends");
ok(venueNamed(venues, "Glaz") === null, "a part of a name does not match: only the whole name does");
ok(venueNamed(venues, "") === null && venueNamed(venues, "   ") === null, "an empty place matches nothing");
ok(venueNamed(venues, "Unknown") === null, "a place never seen is not remembered");

ok(dayStepOf("ArrowLeft") === -1 && dayStepOf("ArrowRight") === 1, "left and right are one day back and forward");
ok(dayStepOf("ArrowUp") === -7 && dayStepOf("ArrowDown") === 7, "up and down are a week back and forward");
ok(dayStepOf("a") === null && dayStepOf("Enter") === null && dayStepOf("constructor") === null, "any other key is not a step");

ok(isTyping(null) === false, "no focused element: the keys are the page's");
ok(isTyping({ tagName: "INPUT" }) && isTyping({ tagName: "textarea" }) && isTyping({ tagName: "SELECT" }), "a field that takes text or a choice keeps its keys");
ok(isTyping({ tagName: "DIV", isContentEditable: true }), "an editable area keeps its keys");
ok(isTyping({ tagName: "BUTTON" }) === false && isTyping({ tagName: "DIV" }) === false, "a button or a plain element does not");

console.log(`\n${n} checks pass`);
