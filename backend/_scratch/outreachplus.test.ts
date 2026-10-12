import assert from "node:assert/strict";
import { expandBlocks, highlightMarks, MARK_OPEN, MARK_CLOSE, zonedToUtc, nextWeekday, validZone, findDates, findDeadline, findFee, findEmails, readOpportunity, isPublicAddress, htmlToText } from "../src/lib/outreachPlus.js";
import { fillFields } from "../src/lib/outreach.js";

const blocks = [{ id: 1, kind: "Short bio", title: "exp", body: "Experimental." }, { id: 2, kind: "Short bio", title: "label", body: "Release-focused." }, { id: 3, kind: "Long bio", title: "x", body: "Long." }];
const rules = [{ kind: "short bio", group: 7, blockId: 2 }, { kind: "Short bio", group: null, blockId: 1 }];
assert.equal(expandBlocks("A {{block:Short bio}} B", rules, blocks, [7]).text, "A Release-focused. B", "group rule wins");
assert.equal(expandBlocks("{{ block : short bio }}", rules, blocks, [3]).text, "Experimental.", "default rule, spacing and case tolerated");
assert.equal(expandBlocks("{{block:Long bio}}", [], blocks, []).text, "Long.", "first block of the kind when no rule");
const miss = expandBlocks("x {{block:Press quote}}", rules, blocks, []); assert.deepEqual(miss.unresolved, ["Press quote"]); assert.ok(miss.text.includes("{{block:Press quote}}"));
assert.deepEqual(expandBlocks("{{block:Short bio}}", rules, blocks, [7]).used, [{ kind: "Short bio", blockId: 2 }]);

// time zones
assert.equal(zonedToUtc("2026-11-03", "10:00", "Europe/Paris")?.toISOString(), "2026-11-03T09:00:00.000Z", "Paris winter = UTC+1");
assert.equal(zonedToUtc("2026-07-03", "10:00", "Europe/Paris")?.toISOString(), "2026-07-03T08:00:00.000Z", "Paris summer = UTC+2");
assert.equal(zonedToUtc("2026-11-03", "10:00", "America/New_York")?.toISOString(), "2026-11-03T15:00:00.000Z", "New York");
assert.equal(zonedToUtc("2026-03-29", "03:30", "Europe/Paris")?.toISOString(), "2026-03-29T01:30:00.000Z", "after the spring clock change");
assert.equal(zonedToUtc("2026-11-03", "10:00", "Mars/Base"), null); assert.equal(validZone("UTC"), true); assert.equal(validZone("nope"), false);
assert.equal(nextWeekday("2026-10-10"), "2026-10-12", "Saturday -> Monday"); assert.equal(nextWeekday("2026-10-11"), "2026-10-12", "Sunday -> Monday"); assert.equal(nextWeekday("2026-10-13"), "2026-10-13");

// marks
const f = fillFields("Dear {{first_name}}", { first_name: "Jo" }, true); assert.equal(f.text, `Dear ${MARK_OPEN}Jo${MARK_CLOSE}`);
assert.equal(highlightMarks(`<p>Dear ${MARK_OPEN}Jo${MARK_CLOSE} <a href="/x${MARK_OPEN}1${MARK_CLOSE}">l</a></p>`), '<p>Dear <span style="background:#ffe08a;border-radius:2px">Jo</span> <a href="/x1">l</a></p>', "highlight, never inside a tag");

// dates and calls
assert.deepEqual(findDates("on 15 March 2027 and March 3rd, 2027 and 2027-04-01 and 05/06/2027").map((d) => d.iso).sort(), ["2027-03-03", "2027-03-15", "2027-04-01", "2027-06-05"]);
assert.equal(findDeadline("Festival runs 20 June 2027. Submission deadline: 15 March 2027. Notified by 1 May 2027.", "2026-10-12"), "2027-03-15", "date after the keyword");
assert.equal(findDeadline("Date limite : 3 février 2027", "2026-10-12"), "2027-02-03", "French");
assert.equal(findDeadline("Deadline 1 January 2020", "2026-10-12"), null, "past deadlines are ignored");
assert.equal(findDeadline("The festival is on 20 June 2027", "2026-10-12"), null, "no deadline word, no guess");
assert.equal(findFee("There is no submission fee."), "free"); assert.equal(findFee("Entry fee: €20 per track"), "€20"); assert.equal(findFee("Submission fee is 15 EUR."), "15 EUR"); assert.equal(findFee("nothing"), null);
assert.deepEqual(findEmails("write to open.call [at] fest.org or Info@Fest.org, noreply@fest.org, logo@2x.png"), ["open.call@fest.org", "info@fest.org"]);
const o = readOpportunity({ html: '<html><head><title>Open Call — Sonic Days</title><meta property="og:title" content="Sonic Days &amp; Co"></head><body><p>Deadline: 2027-02-01. Fee: $10.</p><a href="mailto:calls@sonic.org?subject=x">mail</a></body></html>', url: "https://s.org/call" }, "2026-10-12");
assert.deepEqual(o, { title: "Sonic Days & Co", emails: ["calls@sonic.org"], deadline: "2027-02-01", fee: "$10", url: "https://s.org/call" });
assert.equal(htmlToText("<style>x{}</style><p>Hi&nbsp;there</p><script>1</script><p>Two</p>"), "Hi there\n Two".replace("\n ", "\n"));

for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1", "0.0.0.0"]) assert.equal(isPublicAddress(ip), false, ip);
for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111", "172.32.0.1"]) assert.equal(isPublicAddress(ip), true, ip);
console.log("outreachplus ok");
{
  const { computeStats, cleanStatus, endsWaiting } = await import("../src/lib/outreachPlus.js");
  assert.equal(cleanStatus("replied"), "replied"); assert.equal(cleanStatus("nope"), ""); assert.equal(endsWaiting("accepted"), true); assert.equal(endsWaiting("contacted"), false);
  const cs = [{ id: 1, status: "accepted", repliedAt: null, sentCount: 1, groups: [1] }, { id: 2, status: "contacted", repliedAt: null, sentCount: 2, groups: [1] }, { id: 3, status: "replied", repliedAt: "2026-10-01", sentCount: 1, groups: [2] }, { id: 4, status: "lead", repliedAt: null, sentCount: 0, groups: [1] }];
  const ss = [{ contactId: 1, templateName: "Fest", blocksUsed: [{ blockId: 9 }], sentAt: "2026-10-12T10:00:00Z" }, { contactId: 2, templateName: "Fest", blocksUsed: [{ blockId: 9 }], sentAt: "2026-10-13T10:00:00Z" }, { contactId: 3, templateName: null, blocksUsed: null, sentAt: "2026-10-12T10:00:00Z" }];
  const st = computeStats(cs, ss, [{ id: 1, name: "Festivals" }, { id: 2, name: "Labels" }, { id: 3, name: "Empty" }], [{ id: 9, title: "exp", kind: "Short bio" }]);
  assert.deepEqual(st.groups, [{ name: "Festivals", people: 2, replied: 1, accepted: 1, rate: 50 }, { name: "Labels", people: 1, replied: 1, accepted: 0, rate: 100 }], "groups count only people written to");
  assert.deepEqual(st.templates, [{ name: "Fest", people: 2, replied: 1, accepted: 1, rate: 50 }]);
  assert.equal(st.blocks[0].name, "Short bio: exp"); assert.equal(st.weekdays[1].sent, 2); assert.equal(st.weekdays[1].replied, 2); assert.equal(st.weekdays[2].sent, 1); assert.equal(st.statuses.lead, 1); assert.equal(st.overall.people, 3);
  console.log("stats ok");
}
