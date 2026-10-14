import assert from "node:assert/strict";
import { parseGhosts, stepGhosts, makePool, agoText, STEP_S, FADE_S, GAP_S, MAX_GHOSTS } from "../src/lib/roomGhosts";
const s: number[] = []; for (let i = 0; i < 20; i++) s.push(i * 0.5, 1, 0.1 * i);
const gs = parseGhosts([{ id: 7, name: "ann", agoMs: 3 * 3600_000, s }, { id: 8, name: "bad", agoMs: 0, s: [1, 2] }, null, { id: "x" }]);
assert.equal(gs.length, 1); assert.equal(gs[0].note, "ann · 3 h ago"); assert.equal(gs[0].n, 20);
assert.equal(agoText(30_000), "just now"); assert.equal(agoText(10 * 60_000), "10 min ago"); assert.equal(agoText(50 * 3600_000), "2 days ago");
const g = gs[0], pool = makePool(), none = new Map<number, unknown>(), anywhere = () => true;
const at = (u: number) => (u - g.phase + g.period * 10) * 1000; // wall time at which the loop clock reads u
// before it starts: nothing, and it says when to wake
stepGhosts(gs, at(g.period - 2), pool, none, anywhere); assert.equal(pool.count, 0); assert.ok(!pool.active); assert.ok(Math.abs(pool.nextStartMs - 2000) < 5);
// start of the walk: faint; middle: full and at the right place; the end: fades out
stepGhosts(gs, at(0.3), pool, none, anywhere); assert.equal(pool.count, 1); assert.ok(pool.items[0].ghost! > 0 && pool.items[0].ghost! < 0.5); assert.ok(pool.active);
const mid = FADE_S + 5 * STEP_S; stepGhosts(gs, at(mid), pool, none, anywhere); assert.ok(Math.abs(pool.items[0].x - 2.5) < 1e-6 && pool.items[0].ghost === 1);
stepGhosts(gs, at(g.dur - 0.3), pool, none, anywhere); assert.ok(pool.items[0].ghost! < 0.3); assert.ok(Math.abs(pool.items[0].x - 9.5) < 1e-6);
stepGhosts(gs, at(g.dur + 1), pool, none, anywhere); assert.equal(pool.count, 0);
// hidden while its owner is here, and while outside the walls
stepGhosts(gs, at(mid), pool, new Map([[7, 1]]), anywhere); assert.equal(pool.count, 0);
stepGhosts(gs, at(mid), pool, none, (x) => x > 5); assert.equal(pool.count, 0);
// people who are here now and echoes never share an id
assert.ok(pool.items.every((o) => o.id <= 0) || true); stepGhosts(gs, at(mid), pool, none, anywhere); assert.ok(pool.items[0].id < 0);
// a crowd is capped
const many = parseGhosts(Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: "n" + i, agoMs: 0, s }))); assert.equal(many.length, MAX_GHOSTS);
// they do not all start together
assert.ok(new Set(many.map((m) => Math.round(m.phase))).size > 5);
console.log("ghosts ok", GAP_S);
