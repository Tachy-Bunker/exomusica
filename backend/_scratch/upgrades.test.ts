import assert from "node:assert/strict";
import { cleanChoice, earnedBy, hintLevel, UPGRADES } from "../src/lib/upgrades";
const secs: any[] = [
  { id: "lore", title: "Lore", entries: [{ key: "wiki:a", title: "A", href: "" }, { key: "wiki:b", title: "B", href: "" }] },
  { id: "creatures", title: "P", entries: [{ key: "phenom:x", title: "X", href: "", stages: [{ key: "phenom:x" }, { key: "phenom:x#body" }] }, { key: "phenom:y", title: "Y", href: "", stages: [{ key: "phenom:y" }] }] },
  { id: "empty", title: "E", entries: [] },
];
assert.deepEqual(earnedBy(secs, new Set()), []);
assert.deepEqual(earnedBy(secs, new Set(["wiki:a"])), ["tint"]);
assert.deepEqual(earnedBy(secs, new Set(["phenom:x"])), ["tint"], "half a card is not a full card");
assert.deepEqual(earnedBy(secs, new Set(["phenom:x", "phenom:x#body"])), ["tint", "frame-spark"]);
assert.deepEqual(earnedBy(secs, new Set(["wiki:a", "wiki:b"])), ["tint", "frame-log"], "a whole section; empty sections never count");
assert.equal(UPGRADES.every((u) => u.hints.length === 3 && u.hints.every(Boolean)), true);
const t0 = new Date("2026-10-01T00:00:00Z"), at = (d: number) => new Date(+t0 + d * 86_400_000);
assert.equal(hintLevel(t0, null, at(1)), 0); assert.equal(hintLevel(t0, null, at(5)), 1); assert.equal(hintLevel(t0, null, at(30)), 2);
assert.equal(hintLevel(t0, at(28), at(30)), 0, "re-tuning makes it precise again");
assert.equal(hintLevel(t0, at(-5), at(30)), 2, "an old retune does not reset a newer first sight");
const earned = new Set(["tint", "frame-spark"]);
assert.deepEqual(cleanChoice({ frame: "frame-spark", tint: "#AABBCC" }, earned), { frame: "frame-spark", tint: "#aabbcc" });
assert.equal(cleanChoice({ frame: "frame-log" }, earned), null, "not earned");
assert.equal(cleanChoice({ frame: "evil" }, earned), null); assert.equal(cleanChoice({ tint: "red" }, earned), null); assert.equal(cleanChoice({ tint: "#aabbcc" }, new Set()), null);
assert.deepEqual(cleanChoice({}, earned), { frame: null, tint: null });
console.log("ok");
