import assert from "node:assert/strict";
import { motifFrom, pickSources, rowToHz, standoutRows } from "../src/lib/collectiveJingle.js";
import { packPoints, POINT_COLS, POINT_ROWS } from "../src/lib/specStrip.js";
const strip = (f: (r: number, c: number) => number): Uint8Array => { const p = new Uint8Array(POINT_COLS * POINT_ROWS); for (let r = 0; r < POINT_ROWS; r++) for (let c = 0; c < POINT_COLS; c++) p[r * POINT_COLS + c] = f(r, c) & 15; return packPoints(p); };
assert.equal(rowToHz(0), 130.81);
assert.ok(Math.abs(rowToHz(5) - 261.62) < 0.02); // one octave per five rows
assert.ok(rowToHz(19) > rowToHz(18) && rowToHz(-4) === rowToHz(0) && rowToHz(99) === rowToHz(19));
// row 3 lit in the first half, row 12 in the second
const s = strip((r, c) => (c < POINT_COLS / 2 ? (r === 3 ? 15 : 2) : r === 12 ? 15 : 2));
assert.deepEqual(standoutRows(s), [3, 12]);
assert.equal(standoutRows(new Uint8Array(10)), null);
const flat = strip(() => 7);
assert.ok(standoutRows(flat));
assert.equal(motifFrom([s]), null); // one track is not a collective
assert.equal(motifFrom([s, s, s])!.length, 6);
assert.equal(motifFrom([s, s, s, s, s, s])!.length, 8);
assert.equal(motifFrom([s, new Uint8Array(3)]), null); // a broken strip is skipped, leaving too few
const ids = Array.from({ length: 30 }, (_, i) => i + 1);
assert.deepEqual(pickSources(ids, "2026-10", 5), pickSources([...ids].reverse(), "2026-10", 5));
assert.notDeepEqual(pickSources(ids, "2026-10", 5), pickSources(ids, "2026-11", 5));
console.log("cjingle ok");
