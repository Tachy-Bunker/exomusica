import assert from "node:assert/strict";
import { BLADES, blade, cornerMask, frameOctagon, isPortrait } from "../src/lib/doorShape.js";
import { asDoorStyle } from "../src/lib/doorStyle.js";
assert.equal(BLADES, 9);
const bs = Array.from({ length: BLADES }, (_, i) => blade(i));
for (const b of bs) { assert.ok(!/NaN|Infinity/.test(b.d + b.rib)); assert.ok(b.d.startsWith("M") && b.d.endsWith("Z")); }
assert.equal(new Set(bs.map((b) => b.d)).size, 9, "nine different spikes");
// every spike ends near the middle and starts out at the rim
for (const b of bs) { const pts = b.d.slice(1, -1).split(" L").map((p) => p.split(",").map(Number)); const near = Math.min(...pts.map(([x, y]) => Math.hypot(x, y))); assert.ok(near < 8, "tip near middle " + near); assert.ok(Math.max(...pts.map(([x, y]) => Math.hypot(x / 125, y / 78))) > 0.95); }
// exits are spread round the whole ellipse
assert.ok(bs.some((b) => b.ox > 100) && bs.some((b) => b.ox < -100) && bs.some((b) => b.oy > 60) && bs.some((b) => b.oy < -60));
assert.equal(frameOctagon().split(" ").length, 8);
assert.ok(cornerMask().includes("Z M"));
assert.ok(isPortrait(400, 800) && !isPortrait(800, 400) && !isPortrait(500, 500));
assert.equal(asDoorStyle("hex"), "hex"); assert.equal(asDoorStyle(null), "stronghold"); assert.equal(asDoorStyle("x"), "stronghold");
console.log("door2 ok");
