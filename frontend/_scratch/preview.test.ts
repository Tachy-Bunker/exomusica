import assert from "node:assert/strict";
import { previewLine, previewLines } from "../src/lib/roomPreview";
assert.equal(previewLine({ authorUsername: "ann", contentRaw: "hi <@12> **look** https://x.y/z" }), "ann: hi @ look link");
assert.equal(previewLine({ authorUsername: "ann", contentRaw: "<:wave:5>" }), "ann: ·");
assert.equal(previewLine({ authorUsername: "ann", contentRaw: "   " }), "ann: …");
const long = previewLine({ authorUsername: "bo", contentRaw: "x".repeat(200) }); assert.equal(long.length, 24); assert.ok(long.endsWith("…"));
assert.deepEqual(previewLines([]), ["(quiet in here)"]); assert.deepEqual(previewLines(null), []);
const five = Array.from({ length: 5 }, (_, i) => ({ authorUsername: "u", contentRaw: "m" + i })); assert.deepEqual(previewLines(five), ["u: m2", "u: m3", "u: m4"]);
console.log("preview ok");
