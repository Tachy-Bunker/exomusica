// Counter and switch (fix407, P40): a counter says "reached" once when its count is met, starts again on "reset"; a switch is a light with no picture that sends shown/hidden.
import assert from "node:assert/strict";
import { cleanDoc, WireRuntime } from "../src/lib/roomDoc.js";

const raw = (wires: unknown[]) => ({ v: 1, version: 0, actors: [
  { id: "m", kind: "marker", x: 0, z: 0, name: "m" },
  { id: "r", kind: "marker", x: 1, z: 0, name: "r" },
  { id: "c", kind: "counter", count: 3, x: 0, z: 2, name: "c" },
  { id: "l", kind: "light", x: 3, z: 0, name: "l", on: false },
  { id: "s", kind: "switch", x: 3, z: 3, name: "s", on: false },
], wires });
const wiresOk = [
  { from: "m", ev: "scanned", to: "c", msg: "count", delay: 0, once: false },
  { from: "r", ev: "scanned", to: "c", msg: "reset", delay: 0, once: false },
  { from: "c", ev: "reached", to: "l", msg: "toggle", delay: 0, once: false },
  { from: "c", ev: "reached", to: "s", msg: "toggle", delay: 0, once: false },
  { from: "s", ev: "shown", to: "l", msg: "show", delay: 0, once: false }, // a switch's shown drives the light
];
const doc = cleanDoc(raw(wiresOk));

// 1. the normaliser keeps counters and switches, clamps the count, and drops wires that use events or messages the kind does not have
assert.equal(doc.actors.find((a) => a.id === "c")!.count, 3, "counter keeps its count");
assert.equal(cleanDoc(raw([])).actors.find((a) => a.id === "c")!.count, 3, "counter count is 3 when none is given");
const low = cleanDoc({ v: 1, version: 0, actors: [{ id: "c", kind: "counter", count: 0 }], wires: [] });
assert.equal(low.actors[0].count, 1, "a count below 1 becomes 1");
const high = cleanDoc({ v: 1, version: 0, actors: [{ id: "c", kind: "counter", count: 500 }], wires: [] });
assert.equal(high.actors[0].count, 99, "a count above 99 becomes 99");
assert.equal(doc.actors.find((a) => a.id === "l")!.count, 0, "non-counters carry count 0");
const bad = cleanDoc(raw([{ from: "c", ev: "shown", to: "l", msg: "show", delay: 0, once: false }, { from: "m", ev: "scanned", to: "c", msg: "toggle", delay: 0, once: false }]));
assert.equal(bad.wires.length, 0, "a counter has no 'shown' event and cannot be toggled: both wires are dropped");
assert.equal(cleanDoc(raw(wiresOk)).wires.length, wiresOk.length, "the valid wires are kept");

// 2. the counter counts to 3, says reached once, and toggles the light and the switch on
const rt = new WireRuntime(doc);
rt.start(0);
const scan = (t: number, id = "m") => { rt.emit(id, "scanned", t); rt.tick(t); };
assert.equal(rt.isOn("l"), false, "the light starts off");
scan(1); scan(2);
assert.equal(rt.isOn("l"), false, "two counts: not reached yet");
scan(3);
assert.equal(rt.isOn("l"), true, "the third count reaches it: the light toggles on");
assert.equal(rt.isOn("s"), true, "and the switch too");
scan(4); scan(5);
assert.equal(rt.isOn("l"), true, "counts past the number do not reach it again");

// 3. a reset starts the counter over; the next run of three reaches it once more and toggles back off
scan(6, "r");
scan(7); scan(8);
assert.equal(rt.isOn("l"), true, "after a reset, two counts are not enough");
scan(9);
assert.equal(rt.isOn("l"), false, "the next three counts reach it again: the light toggles off");
assert.equal(rt.isOn("s"), false, "and the switch too");

// 4. a counter with a count of one reaches it at the first count
const one = cleanDoc({ v: 1, version: 0, actors: [{ id: "m", kind: "marker", x: 0, z: 0, name: "m" }, { id: "c", kind: "counter", count: 1, x: 0, z: 0, name: "c" }, { id: "l", kind: "light", x: 0, z: 0, name: "l", on: false }], wires: [{ from: "m", ev: "scanned", to: "c", msg: "count", delay: 0, once: false }, { from: "c", ev: "reached", to: "l", msg: "show", delay: 0, once: false }] });
const rt1 = new WireRuntime(one);
rt1.emit("m", "scanned", 1); rt1.tick(1);
assert.equal(rt1.isOn("l"), true, "a count of one: the first count reaches it");

// 5. a switch that starts on sends shown on start (its state comes from the document)
const sw = cleanDoc({ v: 1, version: 0, actors: [{ id: "s", kind: "switch", x: 0, z: 0, name: "s", on: true }, { id: "l", kind: "light", x: 0, z: 0, name: "l", on: false }], wires: [{ from: "s", ev: "shown", to: "l", msg: "show", delay: 0, once: false }] });
const rt2 = new WireRuntime(sw);
assert.equal(rt2.isOn("s"), true, "a switch that starts on is on");
rt2.start(0); rt2.tick(0);
assert.equal(rt2.isOn("l"), false, "start does not send shown: only a change does");
console.log("counter: all checks passed");
