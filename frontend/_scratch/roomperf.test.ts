import assert from "node:assert/strict";
import { ScaleGovernor, STEPS, DOWN_AFTER, UP_AFTER, HOLD_MS } from "../src/lib/roomPerf.js";
import { layoutHull } from "../src/lib/hullLayout.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import { aimAt, pickLock, refreshLock, lockables } from "../src/lib/roomLock.js";
import type { Eye } from "../src/lib/roomView.js";
const g = new ScaleGovernor(); let t = 10_000;
// fast device: stays at full resolution
for (let i = 0; i < 400; i++) assert.equal(g.observe(2, t += 16), null); assert.equal(g.scale, 1);
// one slow frame is not enough
assert.equal(g.observe(40, t += 16), null); for (let i = 0; i < 5; i++) g.observe(2, t += 16);
// sustained slowness steps down, but not faster than every HOLD_MS
let changes = 0, first = -1;
for (let i = 0; i < 400; i++) { const r = g.observe(20, t += 16); if (r != null) { changes++; if (first < 0) first = r; } }
assert.equal(first, 1); assert.ok(changes >= 2 && changes <= 4, `stepped down ${changes} times in ~6 s`); assert.ok(g.scale < 1);
assert.ok(g.scale >= STEPS[STEPS.length - 1]);
for (let i = 0; i < 2000; i++) g.observe(30, t += 16); assert.equal(g.step, STEPS.length - 1, "bottoms out"); assert.equal(g.minGap, 30, "at the bottom paints are limited to ~30/s");
// recovers when it is easy again, one step at a time
let ups = 0; for (let i = 0; i < 5000; i++) { const r = g.observe(1.5, t += 16); if (r != null) ups++; } assert.equal(g.step, 0, "back to full"); assert.equal(ups, STEPS.length - 1); assert.equal(g.minGap, 0);
assert.ok(g.averageMs >= 0 && g.p95() >= 0);
// borderline times do not make it flap
const h = new ScaleGovernor(); let flips = 0; for (let i = 0; i < 3000; i++) if (h.observe(i % 2 ? 9 : 2, t += 16) != null) flips++; assert.equal(flips, 0, "mid-range load never changes the scale");

// lock-on
const hull = layoutHull([{ id: 1, parentId: null, slug: "a", name: "A", tracks: 5, albums: 1 }, { id: 2, parentId: 1, slug: "b", name: "B", tracks: 5, albums: 1 }, { id: 3, parentId: 1, slug: "c", name: "C", tracks: 5, albums: 1 }], { outer: false });
const w = buildRoom({ hull, slug: "a", name: "A", states: null, albums: [{ slug: "x", title: "X" }], channelSlug: "c" });
const person = { id: 7, name: "zoe", x: 3, z: 0, yaw: 0, tx: 3, tz: 0, tyaw: 0 };
const eye: Eye = { x: 0, z: 0, yaw: 0, pitch: 0 };
assert.equal(lockables(w, [person]).filter((l) => l.kind === "person").length, 1);
const l = pickLock(w, eye, [person]); assert.ok(l, "something is in front"); assert.equal(l!.id, "7", "the person straight ahead wins over farther things");
assert.equal(pickLock(w, { ...eye, yaw: Math.PI }, [person])?.id !== "7", true, "not what is behind you");
// aiming turns toward it and converges
let e2: Eye = { x: 0, z: 0, yaw: 1.2, pitch: 0 }; for (let i = 0; i < 60; i++) e2 = aimAt(e2, l!, 1 / 60); assert.ok(Math.abs(e2.yaw) < 0.05, "faces it"); assert.ok(Math.abs(e2.pitch) < 0.6);
// crosses the +-pi seam the short way
let e3: Eye = { x: 0, z: 0, yaw: 3.0, pitch: 0 }; const behind = { ...l!, x: -3, z: -0.1 }; e3 = aimAt(e3, behind, 1 / 60); assert.ok(e3.yaw > 3.0 || e3.yaw < -3.0, "went the short way round");
// follows a moving person, drops a gone one or a far one
const moved = { ...person, x: 3, z: 2 }; const r1 = refreshLock(l!, w, eye, [moved]); assert.equal(r1?.z, 2);
assert.equal(refreshLock(l!, w, eye, []), null, "person left");
assert.equal(refreshLock(l!, w, { ...eye, x: -30 }, [person]), null, "too far");
const door = lockables(w, []).find((x) => x.kind === "door"); if (door) assert.ok(refreshLock(door, w, eye, []));
console.log("roomperf+lock ok");
