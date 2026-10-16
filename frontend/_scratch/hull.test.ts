// The Hull (fix402, straight hall in fix403): the door to it in the Core, the hall with a door per milestone on both side walls, the corridor between them, collision, and the milestone door's hit test.
import assert from "node:assert/strict";
import { buildRoom, buildHullRoom, wallsOf, DOOR_W, HULL_HALF_W, HULL_HOST, HULL_SLUG, HULL_MAX, type RoomWorld } from "../src/lib/roomWorld.js";
import { buildLink, inRoom, flipLink } from "../src/lib/roomScene.js";
import { collide, milestoneDoorAt, facing } from "../src/lib/roomView.js";
import type { Milestone } from "../src/lib/milestones.js";

const M = (key: string, title: string, reached: boolean): Milestone => ({ key, title, perk: "p", metric: "TRACKS", label: "tracks", target: 10, now: reached ? 10 : 3, reached, reachedAt: null, live: true });
const list = [M("m-roll", "Roll call", true), M("m-tracks", "First hundred", false), M("m-scans", "Wide lens", true), M("m-hull", "Hull", true)];
const core = (ms: Milestone[] | null, slug = HULL_HOST): RoomWorld => buildRoom({ hull: null, slug, name: "Core", states: null, albums: [{ slug: "a1", title: "A1" }], channelSlug: null, milestones: ms });

// 1. the Core gets one door to the Hull; open when the Hull milestone is reached, locked (carrying its card) when not
const reachedCore = core(list);
const hullDoor = reachedCore.doors.find((d) => d.toSlug === HULL_SLUG);
assert.ok(hullDoor, "the Core has a door to the Hull");
assert.equal(hullDoor!.state, "open"); assert.equal(hullDoor!.name, "The Hull"); assert.equal(hullDoor!.milestone?.key, "m-hull");
const lockedCore = core(list.map((m) => (m.key === "m-hull" ? { ...m, reached: false } : m)));
const lockedDoor = lockedCore.doors.find((d) => d.toSlug === HULL_SLUG)!;
assert.equal(lockedDoor.state, "locked"); assert.equal(lockedDoor.name, null); assert.equal(lockedDoor.milestone?.reached, false);
assert.equal(core(null).doors.some((d) => d.toSlug === HULL_SLUG), false, "no milestones given: no Hull door");
assert.equal(core(list, "other").doors.some((d) => d.toSlug === HULL_SLUG), false, "another branch gets no Hull door");
// the regular Core's walls are unchanged: from its corners they are its regular walls
for (let k = 0; k < reachedCore.sides; k++) {
  const a = reachedCore.rot + (k + 0.5) * ((Math.PI * 2) / reachedCore.sides), w = wallsOf(reachedCore)[k];
  assert.ok(Math.abs(w.nx - Math.cos(a)) < 1e-9 && Math.abs(w.nz - Math.sin(a)) < 1e-9 && Math.abs(w.d - reachedCore.inr) < 1e-9, `Core wall ${k} is the regular wall`);
}

// 2. the Hall: a straight hall, one segment of wall per two milestones on each side, the two ends; a door on each segment, milestones alternating sides
const ux = hullDoor!.nx, uz = hullDoor!.nz, px = -uz, pz = ux; // u: from the Core to the Hall; p: across the hall
const hall = buildHullRoom({ core: reachedCore, door: hullDoor!, milestones: list });
const K = Math.ceil(list.length / 2);
assert.equal(hall.slug, HULL_SLUG);
assert.equal(hall.sides, 2 * K + 2, "walls: the two sides in K segments each, and the two ends");
assert.equal(hall.verts.length, hall.sides);
assert.equal(hall.doors.length, list.length + 1, "one door back, one door per milestone");
const back = hall.doors.find((d) => d.id === "back")!;
assert.ok(back.toSlug === reachedCore.slug && back.state === "open" && back.kind === "parent", "the back door leads to the Core");
assert.ok(back.nx * -ux + back.nz * -uz > 0.999, "the back door faces the Core");
const ms = hall.doors.filter((d) => d.milestone);
assert.deepEqual(ms.map((d) => d.name), list.map((m) => m.title), "one door per milestone, in order, named as the milestone");
assert.deepEqual(ms.map((d) => d.state), ["open", "locked", "open", "open"], "lit once reached, dark until then");
assert.equal(new Set(hall.doors.map((d) => d.edge)).size, hall.doors.length, "each door on its own wall");
const side = (d: { nx: number; nz: number }) => Math.sign(d.nx * px + d.nz * pz);
ms.forEach((d, i) => { if (i > 0) assert.notEqual(side(d), side(ms[i - 1]), "milestones alternate sides"); });
const along = (d: { x: number; z: number }) => d.x * ux + d.z * uz;
for (const a of ms) for (const b of ms) if (a !== b && side(a) === side(b)) assert.ok(Math.abs(along(a) - along(b)) >= DOOR_W + 0.5, "doors on one side do not overlap");
// each door sits on the wall it names: its normal and its distance are the wall's
const walls = wallsOf(hall);
for (const d of hall.doors) {
  const w = walls[d.edge];
  assert.ok(Math.abs(w.nx - d.nx) < 1e-6 && Math.abs(w.nz - d.nz) < 1e-6, `door ${d.id} faces its wall`);
  assert.ok(Math.abs(w.d - (d.x * d.nx + d.z * d.nz)) < 1e-6, `door ${d.id} is on its wall`);
}
assert.ok(hall.R > HULL_HALF_W && hall.R < 40, `the hall is a sensible size (R ${hall.R.toFixed(2)})`);
assert.ok(inRoom(hall, hall.spawn.x, hall.spawn.z, 0.5), "you arrive inside the Hull");
assert.equal(inRoom(hall, back.x + back.nx * 1, back.z + back.nz * 1), false, "outside the back door is not the Hull");

// 3. collision: walking into a side door's wall stops you there, and reports that wall (so the door is the one you walked into)
const md = hall.doors.find((d) => d.milestone?.key === "m-tracks")!;
const inside = { x: md.x - md.nx * 1.0, z: md.z - md.nz * 1.0 }, outside = { x: md.x + md.nx * 0.6, z: md.z + md.nz * 0.6 };
assert.ok(inRoom(hall, inside.x, inside.z), "a point in front of the door is inside");
assert.equal(collide(hall, inside.x, inside.z).touched, null, "nothing touched in the middle of the hall");
const c = collide(hall, outside.x, outside.z);
assert.equal(c.touched, md.edge, "the wall you walked into is the door's wall");
assert.ok(inRoom(hall, c.x, c.z), "you are stopped inside the hall");

// 4. the corridor between the Core and the Hall builds from either side; a locked Hull door builds none
const L = buildLink(reachedCore, hullDoor!, hall, 0);
assert.ok(L, "the corridor from the Core to the Hull builds");
assert.ok(buildLink(hall, back, reachedCore, 0), "and from the Hull back to the Core");
assert.equal(flipLink(L!, reachedCore).next.slug, reachedCore.slug, "flipping the corridor keeps its ends");
assert.equal(buildLink(lockedCore, lockedDoor, hall, 0), null, "a shut Hull door has no corridor");
const corridorLen = L!.c.n; assert.ok(corridorLen >= 2, "the corridor has a path");

// 5. the milestone door's hit test: a dark or lit side door is found on its wall; the open way to the Hull is walked through, not a card
const e = (x: number, z: number, yaw = 0) => ({ x, z, yaw, pitch: 0 });
assert.equal(milestoneDoorAt(hall, e(inside.x, inside.z), { edge: md.edge })?.id, md.id, "a dark milestone door is found when walked into");
assert.equal(milestoneDoorAt(hall, e(inside.x, inside.z), { edge: md.edge + 1 === hall.sides ? 0 : md.edge + 1 }), null, "not on another wall");
assert.equal(milestoneDoorAt(hall, e(inside.x, inside.z), null), null);
const lit = hall.doors.find((d) => d.milestone?.key === "m-roll")!;
assert.equal(lit.state, "open"); assert.equal(lit.toSlug, null);
assert.equal(milestoneDoorAt(hall, e(lit.x - lit.nx * 0.5, lit.z - lit.nz * 0.5), { edge: lit.edge })?.id, lit.id, "a lit milestone door shows its card");
assert.equal(milestoneDoorAt(reachedCore, e(hullDoor!.x - hullDoor!.nx * 0.5, hullDoor!.z - hullDoor!.nz * 0.5), { edge: hullDoor!.edge }), null, "the open way to the Hull is not a card");
assert.equal(milestoneDoorAt(lockedCore, e(lockedDoor.x - lockedDoor.nx * 0.5, lockedDoor.z - lockedDoor.nz * 0.5), { edge: lockedDoor.edge })?.id, lockedDoor.id, "the locked Hull door is a milestone door: its card");

// 6. "Use" reads the milestone in its label; the eye has to face the door
const at = (d: { x: number; z: number; nx: number; nz: number }, back: number) => ({ x: d.x - d.nx * back, z: d.z - d.nz * back, yaw: Math.atan2(d.nz, d.nx), pitch: 0 });
const f = facing(hall, at(md, 1.7), 2.7);
assert.ok(f && f.kind === "door" && f.label === "Milestone: First hundred", `the label names the milestone (${f && f.kind === "door" ? f.label : "none"})`);
const fb = facing(reachedCore, at(hullDoor!, 1.7), 2.7);
assert.ok(fb && fb.kind === "door" && fb.label === "Go through: The Hull", "an open door to the Hull reads as a way through");

// 7. the size is capped, and an empty list still gives a hall with its way back
const many = Array.from({ length: 40 }, (_, i) => M(`m-x${i}`, `X${i}`, i % 2 === 0));
const big = buildHullRoom({ core: reachedCore, door: hullDoor!, milestones: many });
assert.equal(big.doors.filter((d) => d.milestone).length, HULL_MAX);
assert.ok(big.sides <= 32, `at most 32 walls (${big.sides})`);
const empty = buildHullRoom({ core: reachedCore, door: hullDoor!, milestones: [] });
assert.equal(empty.doors.length, 1); assert.equal(empty.sides, 4);

console.log("hull ok");
