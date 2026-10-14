import assert from "node:assert/strict";
import { chartTally, layoutChart, roomStates } from "../src/lib/chart";
const B = (id: number, parentId: number | null) => ({ id, slug: "s" + id, name: "n" + id, parentId });
const l = layoutChart([B(1, null), B(2, 1), B(3, 1), B(4, 2), B(5, null)]);
const at = (id: number) => l.rooms.find((r) => r.id === id)!;
assert.equal(at(1).col, 0); assert.equal(at(2).col, 1); assert.equal(at(4).col, 2);
assert.equal(at(4).row, 0); assert.equal(at(3).row, 1); assert.equal(at(2).row, 0); assert.equal(at(1).row, 0.5); assert.equal(at(5).row, 2);
assert.equal(l.cols, 3); assert.equal(l.rows, 3);
// cycles and orphans do not hang
const c = layoutChart([B(1, 2), B(2, 1), B(3, 99)]); assert.equal(c.rooms.length, 3);
assert.deepEqual(layoutChart([]).rooms, []);
const list = [B(1, null), B(2, 1), B(3, 1), B(4, 2), B(5, null)];
const fresh = roomStates(list, new Set());
assert.deepEqual([1, 2, 3, 4, 5].map((i) => fresh.get(i)), ["heard", "unseen", "unseen", "unseen", "heard"]);
const v = roomStates(list, new Set(["s2"]));
assert.deepEqual([1, 2, 3, 4, 5].map((i) => v.get(i)), ["heard", "visited", "unseen", "heard", "heard"]); // its parent and its children are known; the sibling is not
assert.deepEqual(chartTally(v), { visited: 1, heard: 3, unseen: 1, sealed: 0 });
// sealed rooms
const S = (id: number, parentId: number | null, key: string) => ({ id, slug: "", name: "", parentId, secret: true, key });
const sl = [B(1, null), S(2, 1, "kk"), B(3, 2)];
const a = roomStates(sl, new Set());
assert.deepEqual([1, 2, 3].map((i) => a.get(i)), ["heard", "sealed", "unseen"]); // a sealed room shows, what is behind it does not
const b2 = roomStates(sl, new Set(), new Set(["kk"]));
assert.deepEqual([1, 2, 3].map((i) => b2.get(i)), ["heard", "visited", "heard"]); // found: an ordinary room, its neighbours become known
assert.equal(chartTally(a).sealed, 1);
console.log("chart ok");
