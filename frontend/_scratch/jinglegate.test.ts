import assert from "node:assert/strict";
import { shouldPlay } from "../src/lib/jingles";
const base = { classic: false, on: true, done: [] as string[], event: "firstScan", url: "/a.wav" };
assert.equal(shouldPlay(base), true);
assert.equal(shouldPlay({ ...base, on: false }), false); // default off: no surprise audio
assert.equal(shouldPlay({ ...base, classic: true }), false);
assert.equal(shouldPlay({ ...base, url: undefined }), false); // nothing uploaded: silence, never a stand-in
assert.equal(shouldPlay({ ...base, done: ["firstScan"] }), false); // once
assert.equal(shouldPlay({ ...base, done: ["firstReply"] }), true);
console.log("jinglegate ok");
