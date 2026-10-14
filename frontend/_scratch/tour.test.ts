import assert from "node:assert/strict";
import { nextStep, presentStops, shouldInvite, STOPS, stopKey } from "../src/lib/tour";
assert.equal(STOPS.length, 5); assert.equal(new Set(STOPS.map((s) => s.id)).size, 5);
assert.deepEqual(presentStops((sel) => sel.includes("hero") || sel.includes("now")).map((s) => s.id), ["hero", "now"]);
assert.deepEqual(presentStops(() => false), []);
assert.equal(nextStep(0, 3), 1); assert.equal(nextStep(2, 3), -1); assert.equal(nextStep(0, 0), -1);
assert.equal(shouldInvite("", false, false), true);
assert.equal(shouldInvite("skipped", false, false), false); assert.equal(shouldInvite("done", false, false), false);
assert.equal(shouldInvite("", true, false), false); assert.equal(shouldInvite("", false, true), false);
assert.ok(STOPS.every((s) => /^[a-z]{2,12}:[\w.-]+$/.test(stopKey(s.id))));
assert.ok(STOPS.every((s) => s.text.length < 200)); // short enough to read in a glance
console.log("tour ok");
