import assert from "node:assert/strict";
import { seal, unseal } from "../src/lib/secretBox.js";
const s = seal("hunter2 ünï", "k1");
assert.ok(s.startsWith("v1:") && !s.includes("hunter2"));
assert.equal(unseal(s, "k1"), "hunter2 ünï");
assert.equal(unseal(s, "other"), null);
assert.equal(unseal(s.slice(0, -4) + "AAAA", "k1"), null);
assert.equal(unseal(null, "k1"), null);
assert.notEqual(seal("x", "k1"), seal("x", "k1")); // a fresh nonce each time
assert.throws(() => seal("x", ""));
console.log("secretbox ok");
