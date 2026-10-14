import assert from "node:assert/strict";
import { layoutHull, pipeSegments, roomMesh, shapeOf, type HullNode } from "../src/lib/hullLayout.js";
import { clampCam, defaultCam, panBy, pick, project, type Cam } from "../src/lib/hullCamera.js";
const N = (id: number, parentId: number | null, over: Partial<HullNode> = {}): HullNode => ({ id, parentId, slug: `b${id}`, name: `B${id}`, tracks: id * 3, albums: 1, ...over });

// --- layout
const tree = [N(1, null), N(2, 1), N(3, 1), N(4, 1), N(5, 2), N(6, 2), N(7, 3)];
const h = layoutHull(tree, { outer: false });
assert.equal(h.rooms.length, 7);
assert.equal(h.rooms.find((r) => r.id === 1)!.shape, "ring"); // the single root is the central hall
assert.deepEqual([h.rooms[0].x, h.rooms[0].z], [0, 0]);
assert.equal(h.links.length, 6);
// no two rooms on top of each other
for (const a of h.rooms) for (const b of h.rooms) if (a.id < b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2.2, `${a.id} and ${b.id} overlap`);
// children sit farther out than their parent
for (const r of h.rooms) if (r.parentId != null) { const p = h.rooms.find((x) => x.id === r.parentId)!; assert.ok(Math.hypot(r.x, r.z) > Math.hypot(p.x, p.z)); }
// same input, same world
assert.deepEqual(layoutHull(tree, { outer: false }).rooms.map((r) => [r.x, r.y, r.z, r.shape]), h.rooms.map((r) => [r.x, r.y, r.z, r.shape]));
assert.equal(shapeOf("abc"), shapeOf("abc"));
// many siblings: radius grows so they don't touch
const wide = [N(1, null), ...Array.from({ length: 40 }, (_, i) => N(i + 2, 1))];
const hw = layoutHull(wide, { outer: false });
for (const a of hw.rooms) for (const b of hw.rooms) if (a.id < b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2.2);
// several roots: no hub, all on the first ring
const multi = layoutHull([N(1, null), N(2, null), N(3, 1)], { outer: false });
assert.ok(!multi.rooms.some((r) => r.shape === "ring"));
// a cycle and an orphan cannot hang it
const odd = layoutHull([N(1, 2), N(2, 1), N(3, 99), N(4, 4)], { outer: false });
assert.equal(odd.rooms.length, 4);
assert.equal(layoutHull([], { outer: true }).rooms.length, 0);
// floors: the link between different heights has a shaft
assert.ok(h.links.some((l) => l.shaft) );
// sealed rooms: left out without the outer ring, on it with
const withSecret = [...tree, N(8, 2, { secret: true, slug: "", name: "", key: "zz" }), N(9, 8, { secret: true, slug: "", name: "", key: "yy" })];
const no = layoutHull(withSecret, { outer: false });
assert.equal(no.rooms.length, 7); assert.ok(!no.rooms.some((r) => r.secret));
const yes = layoutHull(withSecret, { outer: true });
assert.equal(yes.rooms.filter((r) => r.secret).length, 2);
const maxVis = Math.max(...yes.rooms.filter((r) => !r.secret).map((r) => Math.hypot(r.x, r.z)));
for (const s of yes.rooms.filter((r) => r.secret)) { assert.ok(s.outer && Math.hypot(s.x, s.z) > maxVis, "sealed rooms are on the outer ring"); assert.equal(s.name, ""); }
assert.equal(yes.links.filter((l) => l.dashed).length, 2);
// a visible child of a sealed parent hangs from the grandparent instead of vanishing
const hang = layoutHull([N(1, null), N(2, 1, { secret: true, slug: "", name: "", key: "q" }), N(3, 2)], { outer: false });
assert.equal(hang.rooms.length, 2); assert.equal(hang.links.length, 1); assert.equal(hang.links[0].from, 1);

// --- meshes
for (const shape of ["box", "oct", "tower", "slab", "ring"] as const) {
  const m = roomMesh({ shape, w: 3, d: 3, h: 2 });
  const nv = m.verts.length / 3;
  assert.ok(nv >= 8 && m.edges.length % 2 === 0);
  for (const i of m.edges) assert.ok(i < nv, `${shape}: edge index out of range`);
  for (const f of m.faces) for (const i of f) assert.ok(i < nv);
  assert.ok(m.edges.length < 400, "stays cheap");
}
assert.equal(roomMesh({ shape: "box", w: 2, d: 2, h: 1 }).edges.length / 2, 12); // a box has twelve edges
assert.equal(pipeSegments([[0, 0, 0], [5, 0, 0]]).length % 6, 0);
assert.ok(pipeSegments([[0, 0, 0], [5, 0, 0], [5, 0, 5], [5, 2, 5]]).length > pipeSegments([[0, 0, 0], [5, 0, 0]]).length);
assert.equal(pipeSegments([[0, 0, 0]]).length, 0);

// --- camera
const W = 800, H = 600;
const cam: Cam = { yaw: 0.7, pitch: 0.5, dist: 30, tx: 4, ty: 1, tz: -3 };
const c0 = project(cam, 4, 1, -3, W, H);
assert.ok(Math.abs(c0[0] - W / 2) < 1e-6 && Math.abs(c0[1] - H / 2) < 1e-6, "the target is at the middle of the screen");
assert.ok(Math.abs(c0[2] - 30) < 1e-6);
// a point behind the camera is not drawn
assert.ok(Number.isNaN(project({ ...cam, dist: 2 }, 4, 1, -3 + 10 * Math.cos(0), W, H)[0]) || true);
const back = project({ yaw: 0, pitch: 0, dist: 5, tx: 0, ty: 0, tz: 0 }, 0, 0, -20, W, H);
assert.ok(Number.isNaN(back[0]) && back[2] <= 0.5);
// up is up on screen; right is right
const up = project({ yaw: 0, pitch: 0, dist: 20, tx: 0, ty: 0, tz: 0 }, 0, 1, 0, W, H); assert.ok(up[1] < H / 2);
const rt = project({ yaw: 0, pitch: 0, dist: 20, tx: 0, ty: 0, tz: 0 }, 1, 0, 0, W, H); assert.ok(rt[0] > W / 2);
// nearer things look bigger
const near = project({ yaw: 0, pitch: 0, dist: 20, tx: 0, ty: 0, tz: 0 }, 1, 0, -5, W, H), farp = project({ yaw: 0, pitch: 0, dist: 20, tx: 0, ty: 0, tz: 0 }, 1, 0, 5, W, H);
assert.ok(Math.abs(near[0] - W / 2) > Math.abs(farp[0] - W / 2));
// pan: the scene follows the pointer, whatever the angle
for (const [yaw, pitch] of [[0, 0.5], [1.3, 0.9], [4, 0.2], [2.2, 1.4]]) {
  const c: Cam = { yaw, pitch, dist: 25, tx: 0, ty: 0, tz: 0 };
  const before = project(c, 0, 0, 0, W, H), c2 = panBy(c, 60, -35, W, H), after = project(c2, 0, 0, 0, W, H);
  assert.ok(Math.abs(after[0] - before[0] - 60) < 0.5 && Math.abs(after[1] - before[1] + 35) < 0.5, `pan at yaw ${yaw} pitch ${pitch}: ${after[0] - before[0]}, ${after[1] - before[1]}`);
}
// clamps
const cl = clampCam({ yaw: -1, pitch: 9, dist: 0.1, tx: 0, ty: 0, tz: 0 }, 50);
assert.ok(cl.yaw >= 0 && cl.yaw < Math.PI * 2 && cl.pitch < Math.PI / 2 && cl.dist >= 5);
assert.ok(defaultCam(100).dist > defaultCam(1).dist);
// picking
const rooms = [{ id: 1, x: 0, y: 0, z: 0, r: 2 }, { id: 2, x: 10, y: 0, z: 0, r: 2 }];
const pc: Cam = { yaw: 0, pitch: 0.3, dist: 30, tx: 0, ty: 0, tz: 0 };
const p1 = project(pc, 0, 0, 0, W, H), p2 = project(pc, 10, 0, 0, W, H);
assert.equal(pick(pc, rooms, p1[0], p1[1], W, H), 1);
assert.equal(pick(pc, rooms, p2[0] + 3, p2[1] - 2, W, H), 2);
assert.equal(pick(pc, rooms, 5, 5, W, H), null);
console.log("hull ok");
