import assert from "node:assert/strict";
import { doorTarget } from "../src/lib/doorRoute.js";
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
{
  const click = { button: 0, meta: false, ctrl: false, shift: false, alt: false, defaultPrevented: false };
  const a = { href: "/branch/b/room?from=a", target: null, download: false, origin: "http://x", noDoor: false };
  assert.equal(doorTarget(click, a, "/branch/a/room"), null, "same section: no door");
  assert.equal(doorTarget(click, { ...a, always: true }, "/branch/a/room"), "/branch/b/room?from=a", "data-door-always: room to room plays the door");
  assert.equal(doorTarget(click, { ...a, always: true, noDoor: true }, "/branch/a/room"), null, "no-door still wins");
}
