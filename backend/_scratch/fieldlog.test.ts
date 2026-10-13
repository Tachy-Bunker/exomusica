import assert from "node:assert/strict";
import { buildCatalog, phenomenonStages } from "../src/lib/fieldLog.js";
assert.deepEqual(phenomenonStages({ slug: "a", body: "", chain: null, hasExample: false }).map((s) => s.key), ["phenom:a"]);
assert.deepEqual(phenomenonStages({ slug: "a", body: "x", chain: "c", hasExample: true }).map((s) => s.key), ["phenom:a", "phenom:a#body", "phenom:a#ex", "phenom:a#chain"]);
const c = buildCatalog({ wiki: [{ slug: "w", title: "W" }], studies: [{ slug: "s", title: "S" }], branches: [{ slug: "b", name: "B" }], phenomena: [{ slug: "p", title: "P", body: "", chain: "c", hasExample: false }], albums: [{ slug: "al", title: "Al" }] });
assert.deepEqual(c.map((s) => s.id), ["lore", "creatures", "recordings"]);
assert.deepEqual(c[0].entries.map((e) => e.key), ["wiki:w", "study:s", "branch:b"]);
assert.equal(c[1].entries[0].stages!.length, 2);
const big = buildCatalog({ wiki: Array.from({ length: 900 }, (_, i) => ({ slug: "w" + i, title: "t" })), studies: [], branches: [], phenomena: [], albums: [] });
assert.equal(big[0].entries.length, 400);
// every key must pass the scan-key rule
import { PROBE_KEY } from "../src/lib/probe.js";
for (const s of c) for (const e of s.entries) { assert.ok(PROBE_KEY.test(e.key), e.key); for (const g of e.stages ?? []) assert.ok(PROBE_KEY.test(g.key), g.key); }
console.log("fieldlog ok");
