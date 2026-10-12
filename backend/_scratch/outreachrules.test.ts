import assert from "node:assert";
import { zipSync } from "fflate";
import { simpleParser } from "mailparser";
import { buildDigest, cleanDnc, dncHit, linkifyForTracking, quietDays, safeRedirect, weekStart } from "../src/lib/outreachRules.js";
import { blockLang, expandBlocks, langCode, learn } from "../src/lib/outreachPlus.js";
import { buildRaw } from "../src/lib/outreachMail.js";
import { expandMailFiles } from "../src/lib/outreachEml.js";

// do not contact
assert.ok(dncHit(["a@b.org"], "A@B.org")); assert.ok(!dncHit(["a@b.org"], "c@b.org")); assert.ok(dncHit(["@spam.example"], "x@spam.example")); assert.ok(dncHit(["spam.example"], "x@spam.example")); assert.ok(!dncHit(["spam.example"], "x@notspam.example")); assert.ok(!dncHit(null, "a@b.c"));
assert.deepEqual(cleanDnc([" A@B.org ", "a@b.org", "", 3, "@x.y"]), ["a@b.org", "@x.y"]);
// tracked links
const html = '<a href="https://x.org/a?b=1&amp;c=2">x</a> <a href="mailto:a@b.c">m</a> <a href="#top">t</a> <a href="http://y.org">y</a>';
const seen: string[] = []; const out = linkifyForTracking(html, (u) => { seen.push(u); return `https://me.example/o/${seen.length}`; });
assert.deepEqual(seen, ["https://x.org/a?b=1&c=2", "http://y.org"]); assert.match(out, /href="https:\/\/me\.example\/o\/1"/); assert.match(out, /mailto:a@b\.c/); assert.match(out, /href="#top"/);
assert.equal(safeRedirect("javascript:alert(1)"), null); assert.equal(safeRedirect("https://a.b/c"), "https://a.b/c"); assert.equal(safeRedirect("//a.b"), null);
assert.equal(quietDays("2026-10-01", "2026-10-12"), 11); assert.equal(quietDays(null, "2026-10-12"), null);
// digest
const dg = buildDigest([{ name: "Fest", email: "", status: "contacted", followUpAt: "2026-10-10", deadline: null, repliedAt: null, reopensAt: null, snoozeReason: "after programming" }, { name: "Call", email: "", status: "", followUpAt: null, deadline: "2026-10-20", repliedAt: null, reopensAt: null }, { name: "Lab", email: "", status: "replied", followUpAt: null, deadline: null, repliedAt: "2026-10-09", reopensAt: null }], "2026-10-12");
assert.ok(dg); assert.match(dg!.subject, /1 due, 1 closing/); assert.match(dg!.bodyMd, /after programming/); assert.match(dg!.bodyMd, /not written yet/); assert.match(dg!.bodyMd, /Lab/);
assert.equal(buildDigest([], "2026-10-12"), null);
assert.equal(weekStart(new Date("2026-10-12T09:00:00Z")), "2026-10-12"); assert.equal(weekStart(new Date("2026-10-18T23:00:00Z")), "2026-10-12"); assert.equal(weekStart(new Date("2026-10-19T00:00:00Z")), "2026-10-19");
// language twins
assert.deepEqual(blockLang("Short bio · fr"), { base: "short bio", lang: "fr" }); assert.deepEqual(blockLang("Short bio (EN)"), { base: "short bio", lang: "en" }); assert.deepEqual(blockLang("Short bio"), { base: "short bio", lang: "" });
assert.equal(langCode("Français"), "fr"); assert.equal(langCode("fr-CA"), "fr"); assert.equal(langCode("Klingon"), ""); assert.equal(langCode(""), "");
const blocks = [{ id: 1, kind: "Bio", title: "Short bio", body: "EN text" }, { id: 2, kind: "Bio", title: "Short bio · fr", body: "FR text" }];
assert.equal(expandBlocks("{{block:Bio}}", [], blocks, [], "French").text, "FR text"); assert.equal(expandBlocks("{{block:Bio}}", [], blocks, [], "").text, "EN text"); assert.equal(expandBlocks("{{block:Bio}}", [], blocks, [], "German").text, "EN text");
assert.equal(expandBlocks("{{block:Bio}}", [{ kind: "Bio", group: null, blockId: 2 }], blocks, [], "en").text, "FR text".replace("FR", "FR")); // a twin only replaces within the same base title
// learning from history
const cs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, status: i < 6 ? "replied" : "contacted", repliedAt: i < 6 ? "2026-09-20" : null, sentCount: 1, groups: [1], timezone: null, declineReason: null }));
const sends = cs.map((c) => ({ contactId: c.id, templateName: null, blocksUsed: null, sentAt: new Date(`2026-09-1${c.id % 9}T${c.id < 7 ? "09" : "17"}:10:00Z`) }));
const L = learn(cs, sends, [{ id: 1, name: "Festivals" }]);
assert.equal(L.answerDays.n, 6); assert.ok(L.answerDays.median >= 1); assert.equal(L.answers[0].name, "Festivals"); assert.equal(L.bestHours.length, 0); // under 30 sends: no advice yet
const many = Array.from({ length: 40 }, (_, i) => ({ contactId: (i % 12) + 1, templateName: null, blocksUsed: null, sentAt: new Date(`2026-09-${String(1 + (i % 15)).padStart(2, "0")}T${i % 12 < 6 ? "09" : "17"}:00:00Z`) }));
assert.equal(learn(cs, many, []).bestHours[0], 9);
const declined = learn([{ id: 1, status: "declined", repliedAt: null, sentCount: 1, groups: [], declineReason: "Too long" }, { id: 2, status: "declined", repliedAt: null, sentCount: 1, groups: [], declineReason: "too long" }, { id: 3, status: "declined", repliedAt: null, sentCount: 1, groups: [], declineReason: "No budget" }], [], []);
assert.deepEqual(declined.reasons, [{ reason: "too long", n: 2 }, { reason: "no budget", n: 1 }]); assert.equal(declined.quietAfter, 45);
// EML round trip + zip
const raw = await buildRaw({ from: { fromName: "Tachy", fromEmail: "me@tachy.example", replyTo: null }, to: { email: "prog@fest.example", name: "Marie" }, cc: [], bcc: [], subject: "Submission: Éclats", text: "Hello Marie\nSecond line", html: "<p>Hello Marie</p>", attachments: [], messageId: "<abc@tachy.example>", date: new Date("2026-03-04T10:00:00Z") });
const p = await simpleParser(raw); assert.equal(p.subject, "Submission: Éclats"); assert.equal(p.messageId, "<abc@tachy.example>"); assert.equal(p.date?.toISOString(), "2026-03-04T10:00:00.000Z"); assert.equal(p.to && !Array.isArray(p.to) ? p.to.value[0].address : "", "prog@fest.example"); assert.match(p.text ?? "", /Second line/);
const zip = Buffer.from(zipSync({ "a/one.eml": new Uint8Array(raw), "__MACOSX/._one.eml": new Uint8Array(raw), "readme.txt": new Uint8Array(Buffer.from("x")), "two.eml": new Uint8Array(raw) }));
const ex = expandMailFiles([{ name: "batch.zip", buf: zip }, { name: "solo.eml", buf: raw }, { name: "notes.txt", buf: Buffer.from("hello") }]);
assert.deepEqual(ex.map((x) => x.name), ["one.eml", "two.eml", "solo.eml"]);
assert.throws(() => expandMailFiles([{ name: "x.zip", buf: Buffer.from(zipSync(Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`m${i}.eml`, new Uint8Array(raw)])))) }]), /too many/);
console.log("outreachrules ok");
