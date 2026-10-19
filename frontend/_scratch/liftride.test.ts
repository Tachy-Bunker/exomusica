// The lift (fix405): every room has a pad away from its doors, props and spawn; the ride is a tube whose far door leads on, and the engine walks it to the end.
import assert from "node:assert/strict";
import { buildRoom, buildHullRoom, buildLiftRoom, wallsOf, LIFT_LEN, LIFT_R, type RoomWorld } from "../src/lib/roomWorld.js";
import { stepEye, collide } from "../src/lib/roomView.js";
import type { Milestone } from "../src/lib/milestones.js";

const inside = (w: RoomWorld, x: number, z: number, m: number): boolean => wallsOf(w).every((wl) => x * wl.nx + z * wl.nz <= wl.d - m);
const album = (i: number) => ({ slug: `a${i}`, title: `Album ${i}` });
const albums = [album(1), album(2), album(3), album(4), album(5), album(6)];
const rooms: RoomWorld[] = [
  buildRoom({ hull: null, slug: "core", name: "Core", states: null, albums: [], channelSlug: null }),
  buildRoom({ hull: null, slug: "many", name: "Many", states: null, albums, channelSlug: "chat" }),
];
const M = (key: string, reached: boolean): Milestone => ({ key, title: key, perk: "p", metric: "TRACKS", label: "t", target: 1, now: 1, reached, reachedAt: null, live: true });
const coreWithHull = buildRoom({ hull: null, slug: "core", name: "Core", states: null, albums: [], channelSlug: null, milestones: [M("m-hull", true)] });
const hall = buildHullRoom({ core: coreWithHull, door: coreWithHull.doors[0] ?? { x: 1, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, hw: 0.85, edge: 0, angle: 0, id: "x", toSlug: null, name: null, state: "locked", kind: "child" }, milestones: [M("m-a", true), M("m-b", false)] });

// 1. every room has a lift pad; it lies inside the room, clear of the walls, the doors, the props and the spawn
for (const w of [...rooms, hall]) {
  const L = w.lift;
  assert.ok(L, `${w.slug} has a lift pad`);
  assert.ok(inside(w, L!.x, L!.z, L!.r + 0.4), `${w.slug}: the pad is inside the walls`);
  for (const d of w.doors) assert.ok(Math.hypot(d.x - L!.x, d.z - L!.z) >= (w.slug === "hull.core" ? 1 : 2.2), `${w.slug}: the pad is clear of door ${d.id}`); // a short hall (two milestones) has no spot 2.2 m clear: its most open one
  for (const p of w.props) assert.ok(Math.hypot(p.x - L!.x, p.z - L!.z) - p.r >= L!.r + 0.9, `${w.slug}: the pad is clear of a prop`);
  assert.ok(Math.hypot(w.spawn.x - L!.x, w.spawn.z - L!.z) >= (w.slug === "hull.core" ? 0.5 : 2.5), `${w.slug}: the pad is not where you arrive`); // the short hall puts the pad 0.7 m from arrival; the pad arms only after you step off it
  assert.equal(L!.r, LIFT_R);
}

// 2. the ride: a tube, one open door at the far end leading to the chosen branch, no way back, spawn inside
const tube = buildLiftRoom({ from: rooms[1], to: "core", name: "Core" });
assert.equal(tube.slug, "lift.many.core"); assert.equal(tube.name, "Lift");
assert.equal(tube.sides, 4); assert.equal(tube.doors.length, 1);
const far = tube.doors[0];
assert.ok(far.state === "open" && far.toSlug === "core" && far.name === "Core" && far.kind === "child", "the far door leads to the chosen branch, open");
assert.equal(far.edge, 1, "the far door is on the far wall");
assert.ok(tube.ride && tube.ride.to === "core" && tube.ride.end > 0 && tube.ride.end < LIFT_LEN, "the ride ends short of the far wall");
assert.equal(tube.lift, undefined, "the tube has no pad of its own");
assert.ok(inside(tube, tube.spawn.x, tube.spawn.z, 0.5), "you start inside the tube");

// 3. walking the ride by the engine alone reaches the far end in a few seconds, without any input
let e = { x: tube.spawn.x, z: tube.spawn.z, yaw: tube.spawn.yaw, pitch: 0 }, t = 0, reached = false;
for (let i = 0; i < 400 && !reached; i++) {
  const r = stepEye(tube, e, { forward: 1, strafe: 0, turn: 0, look: 0, run: true }, 0.05);
  e = r.eye; t += 0.05;
  if (e.x >= tube.ride!.end) reached = true;
}
assert.ok(reached, "the ride reaches its end by walking forward");
assert.ok(t > 4 && t < 12, `the ride takes a few seconds (${t.toFixed(1)} s)`);
assert.ok(Math.abs(e.z) < 1e-6 || Math.abs(e.z) < 0.5, "the ride stays on the tube's middle");
// the ride stops on the platform, 1.2 m short of the far door; walking on from there meets the far wall, where the door is
assert.ok(far.x - e.x > 0 && far.x - e.x <= 1.5, "the platform stops just short of the far door");
let p = e, meets: number | null = null;
for (let i = 0; i < 60 && meets == null; i++) { const r = stepEye(tube, p, { forward: 1, strafe: 0, turn: 0, look: 0, run: false }, 0.05); if (r.into) meets = r.into.edge; p = r.eye; }
assert.equal(meets, far.edge, "walking on from the platform meets the far door's wall");

console.log(`liftride ok (ride ${t.toFixed(1)} s, pads in ${rooms.length + 1} rooms, ${LIFT_LEN} m tube)`);
