import assert from "node:assert/strict";
import { slugKey, cleanCell, cleanColumnInput, parseAddresses, fillFields, fieldValues, firstName, dateOnly, addDays, toCsv, planImport, isDue, isEmail } from "../src/lib/outreach.js";
assert.equal(slugKey("Festival Name", []), "festival_name");
assert.equal(slugKey("Name", []), "name_2", "built-in names are never reused");
assert.equal(slugKey("Été 2026!", ["ete_2026"]), "ete_2026_2");
assert.equal(slugKey("2026", []), "c_2026");
assert.equal(slugKey("???", []), "column");
assert.equal(cleanCell("number", null, "3,5"), 3.5); assert.equal(cleanCell("number", null, "abc"), null);
assert.equal(cleanCell("date", null, "2026-02-30"), null); assert.equal(cleanCell("date", null, "2026-10-12T10:00:00Z"), "2026-10-12");
assert.equal(cleanCell("checkbox", null, "yes"), true); assert.equal(cleanCell("checkbox", null, "no"), false);
assert.equal(cleanCell("rating", null, 6), null); assert.equal(cleanCell("rating", null, 4), 4);
assert.equal(cleanCell("select", ["Open", "Closed"], "Open"), "Open"); assert.equal(cleanCell("select", ["Open"], "Nope"), null);
assert.deepEqual(cleanCell("multiselect", ["a", "b"], "a, c, b, a"), ["a", "b"]);
assert.equal(cleanCell("url", null, "javascript:alert(1)"), null); assert.equal(cleanCell("url", null, "https://x.org/a"), "https://x.org/a");
assert.equal(cleanCell("email", null, " A@B.org "), "a@b.org"); assert.equal(cleanCell("email", null, "nope"), null);
assert.equal(cleanColumnInput({ name: "  " }), null);
assert.deepEqual(cleanColumnInput({ name: "Status", type: "select", options: ["A", "A", " B "] }), { name: "Status", type: "select", options: ["A", "B"] });
assert.equal(cleanColumnInput({ name: "X", type: "weird" })!.type, "text");
assert.deepEqual(parseAddresses("a@x.com, B <b@y.org>; a@x.com, nope, c@z.net"), { ok: ["a@x.com", "b@y.org", "c@z.net"], bad: ["nope"] });
assert.ok(isEmail("a@b.co") && !isEmail("a@b") && !isEmail("a b@c.com"));
assert.equal(firstName("  Ana  Maria Silva"), "Ana");
const c = { name: "Ana Silva", email: "ana@x.org", data: { festival: "Sonar", tags: ["a", "b"], done: true, empty: "" }, lastSentAt: new Date("2026-05-01T00:00:00Z"), sentCount: 3 };
const cols = [{ key: "festival", name: "Festival", type: "text" }, { key: "tags", name: "Tags", type: "multiselect" }, { key: "done", name: "Done", type: "checkbox" }, { key: "empty", name: "E", type: "text" }];
const v = fieldValues(c, cols);
assert.deepEqual([v.first_name, v.festival, v.tags, v.done, v.last_sent, v.sent_count], ["Ana", "Sonar", "a, b", "yes", "2026-05-01", "3"]);
const f = fillFields("Dear {{first_name}}, {{ festival }} {{empty|friends}} {{nothing}} {{Festival}}", v);
assert.equal(f.text, "Dear Ana, Sonar friends  Sonar"); assert.deepEqual(f.missing, ["nothing"]);
assert.equal(dateOnly("2026-13-01"), null); assert.equal(addDays("2026-10-28", 5), "2026-11-02");
assert.equal(toCsv([["a", 'b"c', "d,e"], ["1", "2\n3", ""]]), 'a,"b""c","d,e"\r\n1,"2\n3",');
const plan = planImport(["Name", "E-mail", "Festival", "Last sent", "Times sent", "Follow up", "City", "city"], [["Ana", "ana@x.org", "Sonar", "2026-05-01", "2", "2026-06-01", "Lisbon", "x"], ["", "", "", "", "", "", "", ""], ["Bob", "bad", "", "", "", "", "", ""]], [{ key: "festival", name: "Festival", type: "text" }]);
assert.deepEqual(plan.newColumns.map((x) => x.key), ["city"]);
assert.equal(plan.contacts.length, 2); assert.equal(plan.skipped, 1);
assert.deepEqual(plan.contacts[0], { name: "Ana", email: "ana@x.org", data: { festival: "Sonar", city: "x" }, lastSentAt: "2026-05-01", sentCount: 2, status: "", deadline: null, timezone: null, groups: [], followUpAt: "2026-06-01", place: "", lat: null, lng: null });
assert.equal(plan.contacts[1].email, "");
assert.ok(isDue("2026-10-01", new Date("2026-10-12")) && !isDue(null, new Date()) && !isDue("2026-11-01", new Date("2026-10-12")));
console.log("outreach ok");
{
  const plan = planImport(["Name", "Email", "Groups"], [["A", "a@x.org", "Festivals; Open calls"], ["B", "b@x.org", ""], ["", "", "Orphan"]], []);
  assert.deepEqual(plan.contacts.map((c) => c.groups), [["Festivals", "Open calls"], []], "groups column read, empty rows skipped");
  assert.equal(plan.newColumns.length, 0, "Groups is not a custom column");
  console.log("outreach groups ok");
}
{
  const p = planImport(["Name", "Email", "Status", "Deadline", "Timezone", "Website", "Birthday"], [["A", "a@x.org", "Replied", "2027-03-01", "Europe/Paris", "https://a.org", "1990-05-02"]], [], 2000, { website: "url", birthday: "date" });
  assert.deepEqual(p.newColumns.map((c) => [c.name, c.type]), [["Website", "url"], ["Birthday", "date"]], "hinted types create typed columns");
  assert.deepEqual([p.contacts[0].status, p.contacts[0].deadline, p.contacts[0].timezone, p.contacts[0].data.birthday], ["replied", "2027-03-01", "Europe/Paris", "1990-05-02"]);
  {
  const pl = planImport(["Name", "Place", "Latitude", "Longitude"], [["Fest", "Lyon", "45.76", "4,83"], ["Bad", "X", "95", "x"]], [], 100, {});
  assert.deepEqual([pl.contacts[0].place, pl.contacts[0].lat, pl.contacts[0].lng, pl.contacts[1].lat, pl.contacts[1].lng], ["Lyon", 45.76, 4.83, null, null]); assert.equal(pl.newColumns.length, 0);
}
console.log("outreach import hints ok");
}
