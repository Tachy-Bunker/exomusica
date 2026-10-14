import assert from "node:assert/strict";
import { RoomHub, MAX_PER_ROOM, STALE_MS } from "../src/lib/roomHub.js";
const h = new RoomHub(); const t0 = 1_000_000;
const a = h.join(1, "ann", "core", t0)!, b = h.join(2, "bob", "core", t0)!, c = h.join(3, "cy", "b2", t0)!;
assert.deepEqual(h.others("core", a), [], "nobody has a position yet");
assert.ok(h.pose(a, { x: 1, z: 2, yaw: 0.5 }, t0 + 100) && h.pose(b, { x: -3, z: 0, yaw: 1 }, t0 + 100) && h.pose(c, { x: 0, z: 0, yaw: 0 }, t0 + 100));
assert.deepEqual(h.others("core", a), [{ id: 2, name: "bob", x: -3, z: 0, yaw: 1 }]);
assert.deepEqual(h.others("b2", c).length, 0, "other rooms are not seen");
assert.equal(h.pose(a, { x: 1, z: 2, yaw: 0 }, t0 + 120), false, "faster than 80 ms is dropped");
assert.equal(h.pose(a, { x: NaN, z: 0, yaw: 0 }, t0 + 500), false); assert.equal(h.pose(a, { x: "1", z: 0, yaw: 0 }, t0 + 500), false);
assert.ok(h.pose(a, { x: 1e9, z: -1e9, yaw: 99 }, t0 + 500)); const o = h.others("core", b)[0]; assert.ok(Math.abs(o.x) <= 40 && Math.abs(o.z) <= 40 && Math.abs(o.yaw) <= 7, "clamped");
// two tabs of one person: shown once, and never to themselves
const a2 = h.join(1, "ann", "core", t0 + 600)!; h.pose(a2, { x: 5, z: 5, yaw: 0 }, t0 + 700);
assert.equal(h.others("core", b).filter((p) => p.id === 1).length, 1); assert.equal(h.others("core", a).some((p) => p.id === 1), false);
// dirty rooms are reported once
h.takeDirty(); assert.deepEqual(h.takeDirty(), []); h.pose(b, { x: 0, z: 1, yaw: 0 }, t0 + 900); assert.deepEqual(h.takeDirty(), ["core"]);
// leaving and going stale
h.leave(b); assert.equal(h.others("core", a).length, 0); assert.deepEqual(h.takeDirty(), ["core"]);
const gone = h.sweep(t0 + 700 + STALE_MS + 1); assert.ok(gone.includes(a) && gone.includes(a2) && gone.includes(c)); assert.equal(h.size(), 0);
// rules
assert.equal(h.join(9, "x", "bad slug!"), null); assert.equal(h.join(9, "x", ""), null);
const h2 = new RoomHub(); for (let i = 0; i < MAX_PER_ROOM; i++) assert.ok(h2.join(i, "n", "full") != null); assert.equal(h2.join(999, "n", "full"), null, "a full room refuses");
console.log("roomHub ok");
