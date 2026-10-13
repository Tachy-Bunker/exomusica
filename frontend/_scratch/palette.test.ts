import assert from "node:assert/strict";
import { paletteFirst } from "../src/lib/reactionPalette";
const all = [1, 2, 3, 4].map((id) => ({ id }));
const r = paletteFirst(all, [3, 99, 1]);
assert.deepEqual(r.picked.map((e) => e.id), [3, 1]); assert.deepEqual(r.rest.map((e) => e.id), [2, 4]);
assert.deepEqual(paletteFirst(all, []).picked, []); assert.equal(paletteFirst(all, []).rest.length, 4);
console.log("reactionPalette ok");
