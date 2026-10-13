import assert from "node:assert/strict";
import { nearbyComments, layerHue, layersOf, type TrackComment } from "../src/lib/specStrip";
const c = (id: number, at: number, end: number | null, user: string): TrackComment => ({ id, atSeconds: at, endSeconds: end, body: "b", createdAt: "", user, avatarUrl: null, userId: id });
const l = [c(1, 1, null, "a"), c(2, 10, 30, "b"), c(3, 50, null, "a")];
assert.deepEqual(nearbyComments(l, 20).map((x) => x.id), [2]); // inside a region, far from its start
assert.deepEqual(nearbyComments(l, 2).map((x) => x.id), [1]);
assert.deepEqual(nearbyComments(l, 40), []);
assert.deepEqual(layersOf(l), [{ user: "a", n: 2 }, { user: "b", n: 1 }]);
assert.equal(layerHue("a"), layerHue("a")); assert.ok(layerHue("zed") < 360);
console.log("specnotes ok");
