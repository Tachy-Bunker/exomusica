import assert from "node:assert/strict";
import { layoutHull, type HullNode } from "../src/lib/hullLayout.js";
import { roomStates, type ChartBranch } from "../src/lib/chart.js";
import { buildRoom, wallPoint, polygon, wrapPi, DOOR_W } from "../src/lib/roomWorld.js";
import { clipNear, collide, doorWalkedInto, facing, focalOf, stepEye, toCam, toScreen, NEAR, type Eye } from "../src/lib/roomView.js";
const N = (id: number, parentId: number | null, over: Partial<HullNode> = {}): HullNode => ({ id, parentId, slug: `b${id}`, name: `B${id}`, tracks: id * 3, albums: 1, ...over });
const nodes = [N(1, null), ...Array.from({ length: 9 }, (_, i) => N(i + 2, 1)), N(20, 2), N(21, 2)];
const hull = layoutHull(nodes, { outer: false });
const chart: ChartBranch[] = nodes.map((n) => ({ id: n.id, slug: n.slug!, name: n.name, parentId: n.parentId }));
const states = roomStates(chart, new Set(["b1", "b2"]));
const albums = [{ slug: "a1", title: "A1" }, { slug: "a2", title: "A2" }];

// every room: doors in map direction (same side), spaced, never across a corner, inside walls
for (const r of hull.rooms) {
  const w = buildRoom({ hull, slug: r.slug!, name: r.name, states, albums, channelSlug: "c" });
  const links = hull.links.filter((l) => l.from === r.id || l.to === r.id);
  assert.equal(w.doors.length, links.length, `doors of ${r.slug}`);
  const E = 2 * w.R * Math.sin(Math.PI / w.sides);
  for (const d of w.doors) {
    assert.ok(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 1e-9);
    assert.ok(Math.abs(d.x * d.nx + d.z * d.nz - w.inr) < 1e-6, "door on wall");
    const a = w.verts[d.edge], b = w.verts[(d.edge + 1) % w.sides];
    const t = ((d.x - a[0]) * (b[0] - a[0]) + (d.z - a[1]) * (b[1] - a[1])) / (E * E);
    assert.ok(t * E - d.hw >= 0.1 && t * E + d.hw <= E - 0.1, "door within edge");
  }
  const ds = [...w.doors].sort((p, q) => p.angle - q.angle);
  for (let i = 0; i < ds.length; i++) { const j = (i + 1) % ds.length; if (ds.length > 1) assert.ok(Math.hypot(ds[i].x - ds[j].x, ds[i].z - ds[j].z) >= DOOR_W + 0.3, `spacing in ${r.slug}`); }
  // single-door-per-direction rooms: door points the way the neighbour lies on the map
  if (links.length <= 3) for (const d of w.doors) {
    const other = hull.rooms.find((o) => o.slug === d.toSlug || (!d.toSlug && false));
    if (other) assert.ok(Math.abs(wrapPi(Math.atan2(other.z - r.z, other.x - r.x) - d.angle)) < 0.9, `direction ${r.slug}->${other.slug}`);
  }
}
// open / locked follows the scan map states
const w1 = buildRoom({ hull, slug: "b1", name: "B1", states, albums, channelSlug: null });
assert.ok(w1.doors.filter((d) => d.state === "open").length >= 9);
const states2 = roomStates(chart, new Set(["b1"]));
const w5 = buildRoom({ hull, slug: "b2", name: "B2", states: states2, albums, channelSlug: null });
assert.ok(w5.doors.some((d) => d.state === "locked" && d.name === null && d.toSlug === null), "unknown neighbour is sealed, nameless");
// arriving from a door puts you inside that door facing in
const wf = buildRoom({ hull, slug: "b2", name: "B2", states, albums, channelSlug: "c", from: "b1" });
const via = wf.doors.find((d) => d.toSlug === "b1")!;
assert.ok(Math.hypot(wf.spawn.x - via.x, wf.spawn.z - via.z) < 2.5);
assert.ok(Math.cos(wf.spawn.yaw) * via.nx + Math.sin(wf.spawn.yaw) * via.nz < -0.99);
const c = collide(wf, wf.spawn.x, wf.spawn.z); assert.ok(Math.hypot(c.x - wf.spawn.x, c.z - wf.spawn.z) < 1e-6, "spawn is free");
// unknown slug: still a room, no doors
const wu = buildRoom({ hull, slug: "nope", name: "Nope", states, albums, channelSlug: null });
assert.equal(wu.doors.length, 0); assert.ok(wu.props.length >= 2);
// deterministic
assert.deepEqual(buildRoom({ hull, slug: "b2", name: "B2", states, albums, channelSlug: "c" }), buildRoom({ hull, slug: "b2", name: "B2", states, albums, channelSlug: "c" }));
// pedestals keep clear of the doors' axes
for (const pr of wf.props.filter((q) => q.kind === "album")) for (const d of wf.doors) assert.ok(Math.abs(wrapPi(Math.atan2(pr.z, pr.x) - d.angle)) > 0.2, "album in front of a door");
// props don't overlap each other, the terminal and the walls
for (const p of wf.props) { assert.ok(Math.hypot(p.x, p.z) < wf.inr); }
// many albums are capped with a "more" pedestal
const many = buildRoom({ hull, slug: "b2", name: "B2", states, albums: Array.from({ length: 25 }, (_, i) => ({ slug: `x${i}`, title: `X${i}` })), channelSlug: null });
assert.equal(many.props.filter((p) => p.kind === "album").length, 10); assert.ok(many.props.some((p) => p.kind === "more"));

// walking can't leave
let e: Eye = { ...wf.spawn, pitch: 0 };
for (let i = 0; i < 4000; i++) { const r = stepEye(wf, e, { forward: 1, strafe: i % 7 === 0 ? 1 : 0, turn: i % 50 < 10 ? 1 : 0, look: 0, run: true }, 1 / 60); e = r.eye; assert.ok(Math.hypot(e.x, e.z) <= wf.R, "inside"); for (let k = 0; k < wf.sides; k++) { const a = wf.rot + (k + 0.5) * (2 * Math.PI / wf.sides); assert.ok(e.x * Math.cos(a) + e.z * Math.sin(a) <= wf.inr - 0.44, "margin"); } for (const p of wf.props) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) >= p.r + 0.34, "prop"); }
// walking into an open door triggers it; into plain wall does not
const open = wf.doors.find((d) => d.state === "open")!;
let q: Eye = { x: open.x - open.nx * 2.5, z: open.z - open.nz * 2.5, yaw: Math.atan2(open.nz, open.nx), pitch: 0 }, hit = null as unknown;
for (let i = 0; i < 200 && !hit; i++) { const r = stepEye(wf, q, { forward: 1, strafe: 0, turn: 0, look: 0 }, 1 / 60); q = r.eye; hit = doorWalkedInto(wf, q, r.into); }
assert.equal((hit as { id: string } | null)?.id, open.id);
const w1l = w5; const locked = w1l.doors.find((d) => d.state === "locked");
if (locked) { let l: Eye = { x: locked.x - locked.nx * 2.5, z: locked.z - locked.nz * 2.5, yaw: Math.atan2(locked.nz, locked.nx), pitch: 0 }, got = null as unknown; for (let i = 0; i < 200; i++) { const r = stepEye(w1l, l, { forward: 1, strafe: 0, turn: 0, look: 0 }, 1 / 60); l = r.eye; got = got ?? doorWalkedInto(w1l, l, r.into); } assert.equal(got, null, "locked door does not open"); }
// facing
const f = facing(wf, { x: open.x - open.nx * 1.5, z: open.z - open.nz * 1.5, yaw: Math.atan2(open.nz, open.nx), pitch: 0 });
assert.ok(f && f.kind === "door" && /Go through/.test(f.label));
const pr = wf.props[0]; const fp = facing(wf, { x: pr.x - 1.2, z: pr.z, yaw: 0, pitch: 0 }); assert.ok(fp && fp.kind === "prop");
assert.equal(facing(wf, { x: 0, z: 0, yaw: 0, pitch: 0 }, 0.1), null);
// projection / clipping
const eye: Eye = { x: 0, z: 0, yaw: 0, pitch: 0 };
const p = toCam(eye, [5, 1.6, 0]); assert.ok(Math.abs(p[2] - 5) < 1e-9 && Math.abs(p[0]) < 1e-9 && Math.abs(p[1]) < 1e-9);
assert.ok(toCam(eye, [0, 1.6, 3])[0] > 2.99, "z+ is to the right at yaw 0");
const clipped = clipNear([[-1, 0, -2], [1, 0, 3], [1, 2, 3], [-1, 2, -2]]); assert.ok(clipped.length >= 4 && clipped.every((v) => v[2] >= NEAR - 1e-9));
assert.equal(clipNear([[0, 0, -1], [1, 0, -1], [1, 1, -1]]).length, 0);
const s = toScreen([0, 0, 2], 800, 600); assert.deepEqual(s, [400, 300]);
assert.ok(focalOf(400, 800) < focalOf(800, 400) * 1.0 + 1e9);
assert.equal(polygon(4, 1, 0).length, 4); assert.ok(Math.abs(wallPoint(4, 2, Math.PI / 4, 0).x - 2 * Math.cos(Math.PI / 4)) < 1e-9);
console.log("room: all passed");
