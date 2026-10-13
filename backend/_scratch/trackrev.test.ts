import assert from "node:assert/strict";
import { revisionsToPrune, answeredComment } from "../src/lib/trackRevisions";
assert.deepEqual(revisionsToPrune([9, 8, 7, 6, 5]), [6, 5]); assert.deepEqual(revisionsToPrune([9, 8]), []); assert.deepEqual(revisionsToPrune([3, 2, 1], 1), [2, 1]);
assert.equal(answeredComment("4", [3, 4]), 4); assert.equal(answeredComment("5", [3, 4]), null); assert.equal(answeredComment(undefined, [3]), null); assert.equal(answeredComment("x", [3]), null); assert.equal(answeredComment("3.5", [3]), null);
console.log("trackrev ok");
