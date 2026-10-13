import assert from "node:assert/strict";
import { entryState, keysOf, missingHint, sectionStat, shareSummary, type LogSection } from "../src/lib/fieldLog";
const sec: LogSection[] = [
  { id: "lore", title: "Lore", entries: [{ key: "wiki:a", title: "A", href: "/wiki/a" }, { key: "wiki:b", title: "B", href: "/wiki/b" }, { key: "wiki:c", title: "C", href: "/wiki/c" }] },
  { id: "creatures", title: "Phenomena", entries: [{ key: "phenom:x", title: "X", href: "/", stages: [{ key: "phenom:x", label: "Name" }, { key: "phenom:x#body", label: "Notes" }] }] },
  { id: "empty", title: "Empty", entries: [] },
];
const s = keysOf(["lore|wiki:a", "point|point:zz", "lore|phenom:x#body"]);
assert.ok(s.has("wiki:a") && s.has("point:zz"));
assert.deepEqual(entryState(sec[1].entries[0], s), { unlocked: true, stagesDone: 1, stagesTotal: 2 }); // a later step alone still shows the card
assert.deepEqual(entryState(sec[0].entries[1], s), { unlocked: false, stagesDone: 0, stagesTotal: 0 });
assert.deepEqual(sectionStat(sec[0], s), { id: "lore", title: "Lore", found: 1, total: 3, pct: 33 });
assert.equal(sectionStat(sec[2], s).pct, 0); // no divide by zero
assert.equal(missingHint(0), null); assert.equal(missingHint(1), "1 scan point on this page is still unfound."); assert.match(missingHint(3)!, /^3 scan points/);
const sh = shareSummary(sec, s, 2); assert.deepEqual(sh.titles, ["A", "X"]); assert.equal(sh.bars.length, 3);
assert.equal(keysOf(["a|b|c"]).has("b|c"), true); // keys may contain pipes? only the first split counts
console.log("fieldlog fe ok");
