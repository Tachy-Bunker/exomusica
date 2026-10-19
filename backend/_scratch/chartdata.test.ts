import assert from "node:assert/strict";
import { buildChartNodes, slugKey } from "../src/lib/chartData.js";
const r = (id: number, slug: string, parentId: number | null, visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS" = "VISIBLE", chartHidden = false, sealedGate: string | null = null) => ({ id, slug, name: "N" + id, parentId, visibility, chartHidden, sealedGate });
const n = buildChartNodes([r(1, "core", null), r(2, "vault", 1, "HIDDEN"), r(3, "gone", 1, "HIDDEN", true), r(4, "crystal", 1, "BABY_CRYSTALS"), r(5, "plain", 1, "VISIBLE", true)]);
assert.deepEqual(n.map((x) => x.id), [1, 2, 4]); // chartHidden never leaves the server
const sealed = n[1] as Record<string, unknown>;
assert.equal(sealed.secret, true); assert.equal(sealed.slug, undefined); assert.equal(sealed.name, undefined); // a sealed room carries no name or address
assert.equal(sealed.key, slugKey("vault"));
assert.equal(sealed.gate, null); // no gate set: the door needs only the find
const g = buildChartNodes([r(1, "core", null), r(2, "vault", 1, "HIDDEN", false, "m-tracks")])[1] as Record<string, unknown>;
assert.equal(g.gate, "m-tracks"); // the gate is a milestone key, and it still carries no name or address
assert.equal(JSON.stringify(g).includes("vault"), false);
assert.equal(JSON.stringify(n).includes("vault"), false);
// must agree with the browser's hashStr (known value from the frontend implementation)
assert.equal(slugKey(""), (2166136261 >>> 0).toString(36));
assert.notEqual(slugKey("a"), slugKey("b"));
console.log("chartdata ok");
