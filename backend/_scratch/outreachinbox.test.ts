import assert from "node:assert/strict";
import { callsFromMail, mailText } from "../src/lib/outreachInbox.js";
const own = new Set(["me@x.org"]);
const T = "2026-10-13";

// links survive html -> text
const t = mailText('<p>Apply <a href="https://a.org/call?utm=1&amp;x=2">here</a> now</p>', "");
assert.ok(t.includes("https://a.org/call?utm=1&x=2"), t);

// a single mail that is one call
const one = callsFromMail({ from: "calls@sonic.org", subject: "Re: Open call for sound artists - deadline 30 November 2026", text: "We invite submissions for our festival. Deadline: 30 November 2026. Apply at https://sonic.org/apply\nFee: free", html: "", listUnsubscribe: false, own }, T);
assert.equal(one.length, 1); assert.equal(one[0].url, "https://sonic.org/apply"); assert.equal(one[0].deadline, "2026-11-30"); assert.ok(!one[0].title.toLowerCase().startsWith("re:"));

// a receipt is never a call, even with the word 'submission'
assert.equal(callsFromMail({ from: "shop@x.com", subject: "Your order #1234 receipt", text: "Thanks for your submission https://x.com/o", html: "", listUnsubscribe: false, own }).length, 0);
// chatter is not a call
assert.equal(callsFromMail({ from: "friend@x.com", subject: "lunch?", text: "Are we still on for tomorrow? https://maps.example/x", html: "", listUnsubscribe: false, own }, T).length, 0);
// own mail is skipped
assert.equal(callsFromMail({ from: "me@x.org", subject: "Open call deadline 1 December 2026", text: "Open call. Submit by 1 December 2026 https://a.org/x", html: "", listUnsubscribe: false, own }, T).length, 0);

// a newsletter with two calls and a footer
const news = `Sound News Weekly

Open call: Drone Days 2027
Submit your work by 15 December 2026. Details: https://drone.example/call

Residency in Gent
Applications close 20 January 2027 https://gent.example/residency

Unsubscribe https://news.example/unsubscribe?id=1`;
const calls = callsFromMail({ from: "news@sound.org", subject: "Sound News #212", text: news, html: "", listUnsubscribe: true, own }, T);
assert.equal(calls.length, 2, JSON.stringify(calls.map((c) => c.title)));
assert.ok(calls.every((c) => !/unsubscribe/.test(c.url)));
assert.equal(calls[0].deadline, "2026-12-15");

// dedupe within one mail
const dup = callsFromMail({ from: "a@b.org", subject: "x", text: news + "\n\n" + news, html: "", listUnsubscribe: true, own }, T);
assert.equal(dup.length, 2);
console.log("outreachinbox ok");
