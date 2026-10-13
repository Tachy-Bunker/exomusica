import { applyOp, clockOffset, freqOf, stepMs, stepsBetween, SCALE_RATIOS } from "../src/lib/jamTheory";
import assert from "node:assert/strict";
const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
near(stepMs(120), 125); near(stepMs(60), 250);
near(freqOf("dorian", 110, 1, 2), 55); near(freqOf("dorian", 110, 1, 3), 440);
near(freqOf("minor-pent", 110, 6, 2), 55 * 2, 1e-6); // degree 6 of a 5-note scale = root an octave up
near(freqOf("whole-tone", 100, 4, 2), 50 * Math.pow(2, 3 / 6));
assert.equal(SCALE_RATIOS["whole-tone"].length, 6);
const evs = stepsBetween(1000, 1300, 1000, 120, 0); assert.deepEqual(evs.map((e) => e.n), [0, 1, 2]); assert.equal(evs[2].atMs, 1250);
const sw = stepsBetween(1000, 1300, 1000, 120, 0.4); assert.equal(sw[1].atMs, 1000 + 125 + 50, "odd steps are late");
assert.deepEqual(stepsBetween(1100, 1100, 1000, 120, 0), []);
assert.equal(stepsBetween(500, 900, 1000, 120, 0).length, 0, "nothing before the epoch");
const a = stepsBetween(0, 500, 0, 120, 0), b = stepsBetween(500, 1000, 0, 120, 0); assert.equal(a.length + b.length, stepsBetween(0, 1000, 0, 120, 0).length, "windows tile with no step lost or doubled");
const s = { tempo: 100, root: 110, scale: "dorian" as const, swing: 0, steps: [[0, 0], [0, 0], [0, 0], [0, 0]], muted: [false, false, false, false], epoch: 0 };
assert.equal(applyOp(s, { t: "step", lane: 2, step: 1, v: 3 }, 0).steps[2][1], 3); assert.equal(applyOp(s, { t: "tempo", v: 90 }, 77).epoch, 77);
assert.equal(applyOp(s, { t: "mute", lane: 0, v: true }, 0).muted[0], true);
near(clockOffset([{ sent: 100, got: 300, server: 1000 }, { sent: 400, got: 440, server: 1320 }]), 1320 + 20 - 440);
assert.equal(clockOffset([]), 0);
console.log("ok");
