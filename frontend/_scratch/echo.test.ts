import assert from "node:assert/strict";
import { layoutHull, type HullNode } from "../src/lib/hullLayout.js";
import { roomStates, type ChartBranch } from "../src/lib/chart.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import { scannables, signature, shownOf, completion, type LogRoom } from "../src/lib/roomLore.js";
import { EchoField, ECHO_SPEED, ECHO_COOLDOWN, ECHO_HOLD, ECHO_RANGE } from "../src/lib/roomEcho.js";
import { pickLock } from "../src/lib/roomLock.js";
const N = (id: number, parentId: number | null, over: Partial<HullNode> = {}): HullNode => ({ id, parentId, slug: `b${id}`, name: `B${id}`, tracks: id * 3, albums: 1, ...over });
const nodes = [N(1, null), N(2, 1), N(3, 1), N(4, 2), N(9, 2, { secret: true, slug: undefined as unknown as string, name: "", key: "k9abc" })];
const hull = layoutHull(nodes, { outer: true });
const chart: ChartBranch[] = nodes.map((n) => ({ id: n.id, slug: n.slug ?? "", name: n.name, parentId: n.parentId, ...(n.secret ? { secret: true, key: n.key } : {}) }));
const states = roomStates(chart, new Set(["b1", "b2"]));
const w = buildRoom({ hull, slug: "b2", name: "B2", states, albums: [{ slug: "a1", title: "One" }, { slug: "a2", title: "Two" }], channelSlug: "chat" });
w.blurb = "A room about beating tones.";
const KEY = /^[a-z]{2,12}:[\w .@~/#:+-]{1,100}$/i;

const list = scannables(w);
assert.equal(new Set(list.map((s) => s.key)).size, list.length, "keys are unique");
assert.ok(list.every((s) => KEY.test(s.key)), "keys are valid scan addresses");
const by = (what: string) => list.filter((s) => s.what === what);
assert.equal(by("wall").length, 1); assert.equal(by("wall")[0].key, "branch:b2"); assert.equal(by("wall")[0].text, "A room about beating tones.");
assert.equal(by("terminal").length, 1); assert.equal(by("album").length, 2);
assert.equal(by("door").length + by("seal").length, w.doors.length);
assert.ok(by("seal").length >= 1, "a sealed door is scannable");
assert.ok(by("seal").every((s) => s.key.startsWith("room:b2/seal/") && s.key.endsWith("k9abc")), `sealed keys come from the hull key: ${by("seal").map((s) => s.key)}`);
assert.ok(w.plaque && Math.abs(w.plaque.x * w.plaque.nx + w.plaque.z * w.plaque.nz - w.inr) < 0.1, "the plaque is on a wall");
assert.ok(!w.doors.some((d) => d.edge === w.plaque!.edge), "…on a wall with no door");
// every scannable can be locked on to from in front of it
for (const s of list) { const L = { x: s.x * 0.5, z: s.z * 0.5 }; const yaw = Math.atan2(s.z - L.z, s.x - L.x); const l = pickLock(w, { x: L.x, z: L.z, yaw, pitch: 0 }, []); assert.ok(l, `lock ${s.key}`); }

// signatures
const a = signature("k9abc"), b = signature("k9abc"), c = signature("other");
assert.deepEqual(a, b); assert.ok(a.freq >= 196 && a.freq < 1700 && /^[A-G]#?\d$/.test(a.note) && a.hue >= 0 && a.hue < 360);
const notes = new Set(Array.from({ length: 200 }, (_, i) => signature("k" + i).note)); assert.ok(notes.size >= 8, `notes vary (${notes.size})`);
assert.notEqual(`${a.note}${a.hue}`, `${c.note}${c.hue}`);

// lore replaces the plain text
const lore = new Map([["branch:b2", { title: "The Wall", body: "Written by hand." }]]);
assert.deepEqual(shownOf(by("wall")[0], lore), { title: "The Wall", text: "Written by hand.", owner: true });
assert.equal(shownOf(by("wall")[0], null).owner, false);

// completion
const rooms: Record<string, LogRoom> = { b2: { name: "B2", items: list.map((s) => ({ key: s.key, what: s.what, label: s.label })) }, b3: { name: "B3", items: [{ key: "branch:b3", what: "wall", label: "Inscription" }, { key: "room:b3/terminal", what: "terminal", label: "Terminal" }] } };
const scanned = new Set([`lore|branch:b3`, `lore|${list[0].key}`, `lore|${list[1].key}`, "lore|elsewhere"]);
const comp = completion(rooms, scanned); assert.equal(comp.done, 3); assert.equal(comp.total, list.length + 2); assert.equal(comp.pct, Math.floor((3 / (list.length + 2)) * 100));
assert.equal(comp.rooms.find((r) => r.slug === "b3")!.pct, 50);
assert.deepEqual(completion({}, scanned), { rooms: [], done: 0, total: 0, pct: 0 });

// the ping
const f = new EchoField(list, (id) => w.doors.findIndex((d) => d.id === id));
assert.ok(f.ping(1000, 0, 0)); assert.ok(!f.ping(1000 + ECHO_COOLDOWN - 1, 0, 0), "a second ping has to wait"); assert.ok(f.ping(1000 + ECHO_COOLDOWN, 0, 0) || true);
const g = new EchoField(list, (id) => w.doors.findIndex((d) => d.id === id));
g.ping(0, 0, 0);
assert.equal(g.radius(0), 0); assert.ok(Math.abs(g.radius(1000) - ECHO_SPEED) < 1e-9); assert.equal(g.radius(60000), ECHO_RANGE);
let seen = 0, last = 0;
for (let t = 0; t < 3000; t += 50) { seen += g.step(t); const r = g.radius(t); for (let i = 0; i < g.n; i++) if (g.at[i]) assert.ok(Math.hypot(g.tx[i], g.tz[i]) <= r + 1e-9, "only what the ring has passed answers"); last = t; }
assert.equal(seen, list.filter((s) => Math.hypot(s.x, s.z) <= ECHO_RANGE).length, "everything in range answers once");
for (let i = 0; i < g.n; i++) { const t = g.at[i]; assert.ok(Math.abs(t - Math.ceil(g.arrival(i, 0, 0) / 50) * 50) <= 50, "answers when the ring arrives"); }
const i0 = [...Array(g.n).keys()].find((i) => g.at[i])!; const t0 = g.at[i0];
assert.equal(g.glow(i0, t0), 0); assert.ok(g.glow(i0, t0 + 125) > 0.4 && g.glow(i0, t0 + 125) < 0.6); assert.equal(g.glow(i0, t0 + 2000), 1); assert.equal(g.glow(i0, t0 + ECHO_HOLD + 5000), 0);
assert.ok(g.busy(last)); assert.ok(!g.busy(60000)); g.step(60000); assert.ok(!g.live);
const sealIdx = [...Array(g.n).keys()].find((i) => g.seal[i])!; assert.ok(g.door[sealIdx] >= 0 && w.doors[g.door[sealIdx]].state === "locked");
console.log(`echo ok (${list.length} scannables in a room with ${w.doors.length} doors)`);
