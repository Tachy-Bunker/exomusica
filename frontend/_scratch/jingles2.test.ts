import assert from "node:assert/strict";
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { mergeDone } = await import("../src/lib/jingles");
assert.deepEqual(mergeDone(["firstReply"], ["firstScan", "bogus"]), ["firstScan", "firstReply"]);
assert.deepEqual(mergeDone([], []), []);
console.log("ok");
