import { fmtKm, haversineKm, mapLinks, nearest, parseLatLng } from "../src/lib/geo";
import { applyStrategy, buildMergeRows, findDuplicates, pickKeeper, toMergeBody } from "../src/lib/outreachDup";
import { feeBudget, fitScore, lookAlikes, parseFee } from "../src/lib/fit";
import { toIcs } from "../src/lib/ics";
import { voiceFlags } from "../src/lib/voice";
import { pitchChecks } from "../src/lib/pitchCheck";
import { todayLists } from "../src/lib/today";
import type { Col, Contact, Group } from "../src/components/outreach/types";
let n = 0; const eq = (a: unknown, b: unknown, m: string) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); process.exit(1); } };
const ok = (c: unknown, m: string) => eq(!!c, true, m);
const C = (o: Partial<Contact> & { id: number }): Contact => ({ name: "", email: "", data: {}, lastSentAt: null, sentCount: 0, followUpAt: null, groups: [], status: "", deadline: null, repliedAt: null, timezone: "", place: "", lat: null, lng: null, source: "", doNotContact: false, snoozeReason: "", declineReason: "", reopensAt: null, ...o });
const cols: Col[] = [{ id: 1, key: "link", name: "Link", type: "url", options: [], hidden: false, width: null }, { id: 2, key: "fee", name: "Fee", type: "text", options: [], hidden: false, width: null }, { id: 3, key: "notes", name: "Notes", type: "longtext", options: [], hidden: false, width: null }, { id: 4, key: "tags", name: "Tags", type: "multiselect", options: ["a", "b"], hidden: false, width: null }];
const groups: Group[] = [{ id: 1, name: "Festivals" }, { id: 2, name: "Labels" }];

// ---- geo
eq(parseLatLng("48.8566, 2.3522"), { lat: 48.8566, lng: 2.3522 }, "plain pair"); eq(parseLatLng("Paris"), null, "a name is not coordinates"); eq(parseLatLng("40.7 N, 74 W"), { lat: 40.7, lng: -74 }, "N/W letters");
eq(parseLatLng("https://www.google.com/maps/@52.52,13.405,12z"), { lat: 52.52, lng: 13.405 }, "google link");
ok(Math.abs(haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 }) - 344) < 5, "Paris-London is about 344 km"); eq(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0, "zero distance");
eq(fmtKm(3.14), "3.1 km", "short"); eq(fmtKm(344.3), "344 km", "medium"); eq(fmtKm(5712), "5710 km", "long");
const near = nearest([{ id: 1, lat: 52.52, lng: 13.4 }, { id: 2, lat: 48.85, lng: 2.35 }, { id: 3, lat: null, lng: null }, { id: 4, lat: 43.3, lng: 5.37 }], { lat: 48.9, lng: 2.4 });
eq(near.map((x) => x.item.id), [2, 4, 1], "nearest first, no coordinates dropped"); eq(nearest([{ id: 1, lat: 52.52, lng: 13.4 }, { id: 2, lat: 48.85, lng: 2.35 }], { lat: 48.9, lng: 2.4 }, 100).map((x) => x.item.id), [2], "radius");
eq(mapLinks({ place: "", lat: 48.85, lng: 2.35 })?.google, "https://www.google.com/maps/search/?api=1&query=48.850000,2.350000", "coordinates link"); eq(mapLinks({ place: "Lyon, France", lat: null, lng: null })?.google, "https://www.google.com/maps/search/?api=1&query=Lyon%2C%20France", "place-only link"); eq(mapLinks({ place: "", lat: null, lng: null }), null, "nothing to link");
eq(mapLinks({ place: "", lat: 1.5, lng: -2.5 })?.geo, "geo:1.500000,-2.500000", "geo uri");

// ---- duplicates
const list = [
  C({ id: 1, name: "Sonic Fest", email: "Prog@sonic.example", sentCount: 2, status: "contacted", lastSentAt: "2026-05-01", groups: [1], data: { link: "https://sonic.example/call", notes: "likes drone", tags: ["a"] } }),
  C({ id: 2, name: "Sonic Fest 2027", email: "prog@sonic.example", status: "lead", deadline: "2027-01-10", data: { fee: "€10", notes: "open call" } }),
  C({ id: 3, name: "Éclats", email: "", data: { link: "https://eclats.example/open" } }), C({ id: 4, name: "Eclats", email: "x@eclats.example" }),
  C({ id: 5, name: "Lab A", email: "a@label.example" }), C({ id: 6, name: "Lab B", email: "b@label.example" }), C({ id: 7, name: "Friend", email: "f@gmail.com" }), C({ id: 8, name: "Other friend", email: "g@gmail.com" }),
  C({ id: 9, name: "Same page", email: "", data: { link: "https://sonic.example/call/" } }),
];
const dups = findDuplicates(list, cols);
eq(dups.map((g) => [g.ids, g.weak]), [[[1, 2, 9], false], [[3, 4], false], [[5, 6], true]], "strong groups first, webmail never groups");
ok(dups[0].reasons.includes("same email address") && dups[0].reasons.includes("same web page"), "reasons listed"); eq(findDuplicates([C({ id: 1, name: "Ab" }), C({ id: 2, name: "Ab" })], []).length, 0, "very short names are ignored");
eq(findDuplicates([C({ id: 1, name: "Sonic Fest", email: "a@x.example" }), C({ id: 2, name: "Sonic Fest", email: "b@y.example" })], []).length, 0, "same name but different organisations is not a duplicate");
// ---- merge
const g1 = list.filter((c) => [1, 2].includes(c.id)); const rows = buildMergeRows(g1, cols, groups); const by = (f: string) => rows.find((r) => r.field === f)!;
ok(by("email").same, "equal emails need no decision"); ok(!by("name").same, "different names do"); ok(!rows.find((r) => r.field === "timezone"), "empty rows are dropped"); eq(pickKeeper(g1), 1, "the record with mail survives");
const order = [1, 2];
let ch = applyStrategy(rows, "newest", order); eq([ch.name, ch.status, ch.deadline, ch.sentCount], ["Sonic Fest 2027", "lead", "2027-01-10", 0], "newest takes the newest record's values (status included)");
ch = applyStrategy(rows, "oldest", order); eq([ch.name, ch.status, ch.sentCount], ["Sonic Fest", "contacted", 2], "oldest");
ch = applyStrategy(rows, "complete", order); eq([ch.name, ch["data:notes"], ch.sentCount], ["Sonic Fest 2027", "likes drone", 2], "most complete: the longer text, the larger count");
ch = applyStrategy(rows, "combine", order); eq([ch.name, ch.status, ch.sentCount, ch.lastSentAt, ch.groups, ch["data:notes"]], ["Sonic Fest / Sonic Fest 2027", "contacted", 2, "2026-05-01", ["Festivals"], "likes drone\n\nopen call"], "combine: both names, furthest status, summed count, union, long text stacked");
eq([ch["data:link"], ch["data:fee"]], ["https://sonic.example/call", "€10"], "a field only one side has is kept");
const body = toMergeBody(1, [1, 2], ch, groups); eq([body.keepId, body.ids, (body.values as { groups: number[] }).groups, (body.values as { data: Record<string, unknown> }).data.fee], [1, [1, 2], [1], "€10"], "request body");
eq(applyStrategy(buildMergeRows([C({ id: 1, name: "A", place: "Lyon", lat: 45.7, lng: 4.8 }), C({ id: 2, name: "A", place: "Lyon, France" })], [], []), "complete", [1, 2]).place, { place: "Lyon", lat: 45.7, lng: 4.8 }, "a place with coordinates beats a longer one without");
eq(applyStrategy(buildMergeRows([C({ id: 1, name: "A", status: "replied" }), C({ id: 2, name: "A", status: "contacted" })], [], []), "combine", [1, 2]).status, "replied", "furthest along wins");

// ---- fit
eq(parseFee("€25"), 25, "euro"); eq(parseFee("12,50 EUR"), 12.5, "decimal comma"); eq(parseFee("Free"), 0, "free"); eq(parseFee(""), null, "none"); eq(parseFee("1 000 €"), 1000, "thin space thousands");
const prof = { keywords: ["drone", "spatial"], avoid: ["pop"], regions: ["france"], maxFee: 20 };
const f1 = fitScore(C({ id: 1, name: "Spatial audio open call", place: "Lyon, France", data: { fee: "€10", notes: "drone friendly" }, deadline: "2026-12-01" }), cols, prof, "2026-10-12");
ok(f1.score >= 85, `a good fit scores high (${f1.score})`); ok(f1.why.length >= 2, "says why");
const f2 = fitScore(C({ id: 2, name: "Pop contest", data: { fee: "€60" }, deadline: "2026-10-01" }), cols, prof, "2026-10-12"); ok(f2.score < 20, `a poor fit scores low (${f2.score})`); ok(f2.why.some((w) => /closed/.test(w)), "closed flagged");
eq(fitScore(C({ id: 3, name: "x" }), cols, {}, "2026-10-12").score, 50, "empty profile is neutral");
const win = [C({ id: 1, name: "Drone fest Lyon", status: "accepted", groups: [1] }), C({ id: 2, name: "Drone residency Basel", status: "accepted", groups: [1] }), C({ id: 3, name: "Drone gallery Bern", groups: [1], status: "lead" }), C({ id: 4, name: "Techno club", status: "lead" }), C({ id: 5, name: "Drone old", status: "lead", deadline: "2026-01-01" })];
const la = lookAlikes(win, [], groups, "2026-10-12"); eq(la.map((x) => x.contact.id), [3], "only open, unwritten, similar rows"); ok(la[0].shared.includes("Festivals") || la[0].shared.includes("drone"), "shares named");
eq(lookAlikes([C({ id: 1, name: "a" })], [], [], "2026-10-12"), [], "nothing to learn from yet");
const bud = feeBudget([C({ id: 1, sentCount: 1, lastSentAt: "2026-03-01", data: { fee: "€30" } }), C({ id: 2, sentCount: 1, lastSentAt: "2026-04-01", data: { fee: "free" } }), C({ id: 3, sentCount: 1, lastSentAt: "2025-04-01", data: { fee: "€99" } }), C({ id: 4, sentCount: 0, lastSentAt: null, data: { fee: "€5" } })], cols, "2026", 25);
eq(bud, { spent: 30, paidCalls: 1, left: -5, over: true }, "budget counts this year's paid calls only");

// ---- calendar
const ics = toIcs([C({ id: 1, name: "Sonic, Fest", deadline: "2026-11-30", place: "Lyon" }), C({ id: 2, name: "Done", deadline: "2026-11-01", status: "accepted" }), C({ id: 3, name: "F", followUpAt: "2026-10-20", snoozeReason: "after programming" }), C({ id: 4, name: "R", reopensAt: "2027-03-01" })], new Date("2026-10-12T10:00:00Z"));
ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trimEnd().endsWith("END:VCALENDAR"), "wrapped"); ok(ics.includes("DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201"), "all-day with exclusive end");
ok(ics.includes("SUMMARY:Closes: Sonic\\, Fest"), "commas escaped"); ok(ics.includes("TRIGGER:-P7D") && ics.includes("TRIGGER:-P2D"), "the 7 and 2 day reminders"); ok(!ics.includes("Done"), "answered calls are left out"); ok(ics.includes("Follow up: F") && ics.includes("Reopens: R"), "follow-ups and reopenings");
ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "no line longer than 75 bytes"); eq((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3, "three events");
ok(toIcs([C({ id: 1, name: "é".repeat(80), deadline: "2026-11-30" })]).includes("\r\n "), "long lines fold");

// ---- voice
eq(voiceFlags("Dear Marie,\nSorry to bother you, I just wanted to share my work. If you have time, maybe listen?").map((v) => v.phrase.toLowerCase()), ["sorry to bother", "i just wanted to", "if you have time", "maybe"], "weak phrases found in order");
eq(voiceFlags("I submit the piece. {{maybe}}\n> sorry to bother you (quoted)"), [], "merge fields and quoted mail are skipped");
ok(pitchChecks({ subject: "Submission: Piece, Project", body: "Dear Marie, sorry to bother you. I would like to submit https://x.bandcamp.com", fileBytes: 0, hasAudioLink: false, recipients: 1 }).some((x) => /Weak phrasing/.test(x.text)), "the pitch check reports it");

// ---- today
const T = todayLists([C({ id: 1, name: "A", deadline: "2026-10-14", email: "a@x.org", status: "lead" }), C({ id: 2, name: "B", deadline: "2026-10-18", email: "b@x.org" }), C({ id: 3, name: "C", deadline: "2026-10-30", email: "c@x.org" }), C({ id: 4, name: "D", deadline: "2026-10-13", sentCount: 1, status: "contacted" }), C({ id: 5, name: "E", reopensAt: "2026-11-01" }), C({ id: 6, name: "F", reopensAt: "2027-06-01" })], "2026-10-12");
eq(T.ladder.map((r) => [r.contact.id, r.tier]), [[1, 2], [2, 7]], "unwritten calls climb the ladder at 7 and 2 days"); eq(T.reopening.map((c) => c.id), [5], "reopening within 30 days");
console.log(`outreachUi2: ${n} checks ok`);
