// fix420: the subscription links (idea 10). Pure. Run with: npx tsx _scratch/calendarFix420.test.ts
import assert from "node:assert/strict";
import { feedLinks } from "../src/lib/calendarFeedLinks";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; console.log("ok  ", m); };

const open = feedLinks("https://exo.example/", "club", null);
ok(open.https === "https://exo.example/api/calendars/club/feed.ics" && open.webcal === "webcal://exo.example/api/calendars/club/feed.ics", "an open calendar's links have no key, and a trailing slash on the origin is dropped");
const prot = feedLinks("https://exo.example", "secret", "ab-_9");
ok(prot.https === "https://exo.example/api/calendars/secret/feed.ics?k=ab-_9" && prot.webcal === "webcal://exo.example/api/calendars/secret/feed.ics?k=ab-_9", "a protected calendar's links carry its key, in both forms");
ok(feedLinks("http://localhost:4173", "club", null).webcal === "webcal://localhost:4173/api/calendars/club/feed.ics", "an http origin becomes webcal too");
ok(feedLinks("https://exo.example", "club", "a+b/c=").https.endsWith("?k=a%2Bb%2Fc%3D"), "a key is encoded for the address");
ok(feedLinks("https://exo.example", "a b", null).https.includes("/calendars/a%20b/feed.ics"), "a slug is encoded for the address");

console.log(`\n${n} checks pass`);
