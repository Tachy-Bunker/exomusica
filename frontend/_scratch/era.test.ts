import assert from "node:assert/strict";
import { ERAS, ERA_DAYS, eraAccents, eraOf, rotateHue } from "../src/lib/era.js";
import { humRoot, humWanted, HUM_ROOTS } from "../src/lib/eraHum.js";
import { contrast } from "../src/lib/skin.js";
assert.equal(eraOf(0), 0); assert.equal(eraOf(ERA_DAYS - 1), 0); assert.equal(eraOf(ERA_DAYS), 1); assert.equal(eraOf(ERA_DAYS * ERAS.length), 0, "eras cycle"); assert.equal(eraOf(-5), 0);
assert.deepEqual(eraAccents(0), { accentForum: "#e2703f", accentForumDim: "#7a3a1f", accentAudio: "#4fa8e0", accentAudioDim: "#1f4566" });
const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2);
assert.ok(near(rotateHue("#e2703f", 0), "#e2703f") && near(rotateHue("#e2703f", 360), "#e2703f"));
const seen = new Set<string>();
for (let e = 0; e < ERAS.length; e++) {
  const a = eraAccents(e); seen.add(a.accentForum);
  assert.ok(contrast(a.accentForum, "#0a0e1c") >= 4.2 && contrast(a.accentAudio, "#0a0e1c") >= 4.2, `era ${e} contrast`);
  assert.notEqual(a.accentForum, a.accentAudio);
}
assert.equal(seen.size, ERAS.length, "every era has its own colour");
assert.equal(humRoot(0), HUM_ROOTS[0]); assert.equal(humRoot(ERAS.length), HUM_ROOTS[0]); assert.equal(humRoot(-1), HUM_ROOTS[5]);
const w = { on: true, unlocked: true, classic: false, playing: false, hidden: false };
assert.ok(humWanted(w));
for (const k of ["on", "unlocked"] as const) assert.ok(!humWanted({ ...w, [k]: false }));
for (const k of ["classic", "playing", "hidden"] as const) assert.ok(!humWanted({ ...w, [k]: true }));
console.log("era ok");
