import assert from "node:assert/strict";
import { indexOfDate, dateOfIndex, layoutGraph } from "../src/lib/stationCalendar.ts";
for (const i of [0, 27, 28, 363, 364, 365, 1000]) { const s = dateOfIndex(i); assert.equal(indexOfDate(s.cycle, s.month, s.day), i); }
assert.equal(indexOfDate(1, 13, 1), null);
const N = (id: number, requires: number[] = []) => ({ id, requires, quorum: 0, published: true, title: "t" + id });
const L = layoutGraph([N(1), N(2, [1]), N(3, [1]), N(4, [2, 3]), N(5)]);
assert.deepEqual([1, 2, 3, 4, 5].map((i) => L.get(i)!.depth), [0, 1, 1, 2, 0]);
assert.notEqual(L.get(2)!.y, L.get(3)!.y); assert.equal(L.get(1)!.y === L.get(5)!.y, false);
const loop = layoutGraph([N(1, [2]), N(2, [1])]); assert.ok(loop.has(1) && loop.has(2));
console.log("station ok");
