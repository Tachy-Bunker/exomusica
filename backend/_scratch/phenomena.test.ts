import assert from "node:assert/strict";
import { cleanPhenomenon, validChain, phenomenonSlug } from "../src/lib/phenomena";
const ok = Buffer.from(JSON.stringify([["Galactic3", [0.1, 1]]])).toString("base64url");
assert.ok(validChain(ok)); assert.ok(!validChain("x!")); assert.ok(!validChain(Buffer.from('[["a b",[0]]]').toString("base64url"))); assert.ok(!validChain(Buffer.from('[["Ok",[3]]]').toString("base64url")));
assert.equal(phenomenonSlug("Beating  Tones!"), "beating-tones");
assert.ok("error" in cleanPhenomenon({}, false)); assert.ok("data" in cleanPhenomenon({ title: " A " }, false));
const r = cleanPhenomenon({ chain: "", exampleTrackId: null }, true); assert.ok("data" in r && r.data.chain === null && r.data.exampleTrackId === null);
assert.ok("error" in cleanPhenomenon({ chain: "bad!" }, true)); assert.ok("error" in cleanPhenomenon({ exampleTrackId: 1.5 }, true));
console.log("phenomena ok");
