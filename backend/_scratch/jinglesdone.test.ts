import assert from "node:assert/strict";
import { addDone, cleanDone } from "../src/lib/jinglesDone";
assert.deepEqual(cleanDone(["firstReply", "x", "firstScan", "firstScan", 5]), ["firstScan", "firstReply"]);
assert.deepEqual(cleanDone(null), []);
assert.deepEqual(addDone(["firstScan"], "firstListen"), ["firstScan", "firstListen"]);
assert.deepEqual(addDone(["firstScan"], "firstScan"), ["firstScan"]);
assert.equal(addDone([], "evil"), null); assert.equal(addDone([], 3), null);
console.log("ok");
