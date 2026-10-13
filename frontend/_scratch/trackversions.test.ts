import assert from "node:assert/strict";
import { answeredIds } from "../src/lib/trackVersions";
assert.equal(answeredIds(null).size, 0);
const d = { owner: "a", revisions: [{ id: 1, at: 0, url: "/u/a", answers: { id: 5, atSeconds: 1, body: "b", user: "x" } }, { id: 2, at: 0, url: "/u/b", answers: null }] };
assert.deepEqual([...answeredIds(d)], [5]);
console.log("trackversions ok");
