import assert from "node:assert";
import { makeLimiter, readWorkspaceToken, signWorkspaceToken, slugify } from "../src/lib/outreachScope.js";
process.env.JWT_SECRET = "x";
const t = signWorkspaceToken(3, 1); assert.deepEqual(readWorkspaceToken(t), { w: 3, v: 1 });
assert.equal(readWorkspaceToken(t.slice(0, -2) + "xx"), null); assert.equal(readWorkspaceToken("a.b"), null); assert.equal(readWorkspaceToken(undefined), null);
assert.equal(readWorkspaceToken(signWorkspaceToken(3, 1, -1)), null);
let now = 0; const l = makeLimiter(3, 1000, () => now);
for (let i = 0; i < 3; i++) { assert.equal(l.blocked("a"), 0); l.fail("a"); }
assert.ok(l.blocked("a") > 0); assert.equal(l.blocked("b"), 0); now = 1500; assert.equal(l.blocked("a"), 0); l.fail("a"); l.clear("a"); assert.equal(l.blocked("a"), 0);
assert.equal(slugify("  Kicool Grumm & Co! "), "kicool-grumm-co"); assert.equal(slugify("Élodie"), "elodie");
console.log("outreachscope ok");
