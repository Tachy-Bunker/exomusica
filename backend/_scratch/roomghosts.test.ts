import assert from "node:assert/strict";
import { GhostStore, SAMPLE_GAP_MS, MAX_SAMPLES, MAX_PER_ROOM, MAX_AGE_MS } from "../src/lib/roomGhosts.js";
const g = new GhostStore(); let t = 1_000_000;
const walk = (key: number, n: number, step = 1) => { for (let i = 0; i < n; i++) { g.sample(key, i * step, 0, 0.5, t); t += SAMPLE_GAP_MS; } };
// too short a walk, or standing still, leaves nothing
g.begin(1, 10, "ann", "core"); walk(1, 4); assert.equal(g.end(1, t), false);
g.begin(2, 10, "ann", "core"); walk(2, 20, 0); assert.equal(g.end(2, t), false);
// samples closer than the gap are dropped
g.begin(3, 10, "ann", "core"); for (let i = 0; i < 30; i++) g.sample(3, i, 0, 0, t + i); assert.equal(g.end(3, t), false, "30 samples in 30 ms is one sample");
// a real walk becomes an echo, others see it, its owner does not
g.begin(4, 10, "ann", "core"); walk(4, 20); assert.ok(g.end(4, t));
const out = g.forRoom("core", 11, t + 5000); assert.equal(out.length, 1); assert.equal(out[0].name, "ann"); assert.equal(out[0].s.length, 60); assert.equal(out[0].agoMs, 5000);
assert.equal(g.forRoom("core", 10, t).length, 0); assert.equal(g.forRoom("elsewhere", 11, t).length, 0);
// the same person's newer walk replaces the old one
g.begin(5, 10, "ann", "core"); walk(5, 12, 2); g.end(5, t); assert.equal(g.forRoom("core", 99, t).length, 1);
// only the latest minute is kept
g.begin(6, 12, "bo", "core"); walk(6, 400); g.end(6, t); const bo = g.forRoom("core", 99, t).find((x) => x.name === "bo")!; assert.equal(bo.s.length, MAX_SAMPLES * 3); assert.equal(bo.s[bo.s.length - 3], 399);
// a few per room, oldest go first
for (let u = 20; u < 20 + MAX_PER_ROOM + 5; u++) { g.begin(100 + u, u, "u" + u, "core"); walk(100 + u, 12, 2); g.end(100 + u, t); t += 10; }
assert.equal(g.forRoom("core", 0, t).length, MAX_PER_ROOM); assert.equal(g.forRoom("core", 0, t)[0].name, "u" + (20 + MAX_PER_ROOM + 4));
// old echoes fade away
assert.equal(g.forRoom("core", 0, t + MAX_AGE_MS + 1).length, 0);
// forgetting
g.begin(7, 77, "cy", "lab"); walk(7, 12, 2); g.end(7, t); assert.equal(g.forRoom("lab", 0, t).length, 1); g.forget(77); assert.equal(g.forRoom("lab", 0, t).length, 0);
// no leak: ending twice or unknown keys are harmless
assert.equal(g.end(999), false); assert.equal(g.recording(), 0);
console.log("roomghosts ok");
