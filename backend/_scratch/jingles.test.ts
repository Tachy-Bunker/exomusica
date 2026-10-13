import assert from "node:assert/strict";
import { isJingleEvent, withJingle } from "../src/lib/jingles.js";
assert.ok(isJingleEvent("firstScan")); assert.ok(!isJingleEvent("__proto__")); assert.ok(!isJingleEvent("constructor"));
assert.deepEqual(withJingle(null, "firstScan", "/u/a.wav"), { firstScan: "/u/a.wav" });
assert.deepEqual(withJingle({ firstScan: "/u/a.wav", bogus: "x", firstReply: 5 }, "firstListen", "/u/b.wav"), { firstScan: "/u/a.wav", firstListen: "/u/b.wav" });
assert.equal(withJingle({ firstScan: "/u/a.wav" }, "firstScan", null), null);
assert.deepEqual(withJingle([], "sectionDone", "/u/c.wav"), { sectionDone: "/u/c.wav" });
console.log("jingles ok");
