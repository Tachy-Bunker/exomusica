import assert from "node:assert/strict";
import { clampEnd } from "../src/lib/trackComments";
assert.equal(clampEnd(2, undefined, 10), null); assert.equal(clampEnd(2, null, 10), null);
assert.equal(clampEnd(2, 5.04, 10), 5); assert.equal(clampEnd(2, 99, 10), 10);
assert.equal(clampEnd(2, 2.1, 10), null); assert.equal(clampEnd(2, 1, 10), null); assert.equal(clampEnd(2, "x", 10), null);
assert.equal(clampEnd(9.9, 20, 10), null);
console.log("clampEnd ok");
