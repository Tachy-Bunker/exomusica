import assert from "node:assert/strict";
import { buildCatalog } from "../src/lib/fieldLog";
const base = { wiki: [], studies: [], branches: [], phenomena: [], albums: [] };
assert.equal(buildCatalog(base).some((s) => s.id === "ancients"), false, "no old voices, no section");
const s = buildCatalog({ ...base, ancients: [{ username: "zed", founder: false }, { username: "Ada", founder: true }, { username: "ada", founder: false }, { username: "bob", founder: false }] }).find((x) => x.id === "ancients")!;
assert.deepEqual(s.entries.map((e) => e.title), ["@Ada", "@bob", "@zed"], "founders first, one entry per name");
assert.equal(s.entries[0].key, "user:Ada"); assert.equal(s.entries[0].href, "/u/Ada");
console.log("ok");
