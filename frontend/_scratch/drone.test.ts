import assert from "node:assert/strict";
import { layoutHull } from "../src/lib/hullLayout.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import { droneHome, startDrone, stepDrone } from "../src/lib/roomDrone.js";
import { stepEye, type Eye } from "../src/lib/roomView.js";
const hull = layoutHull([{ id: 1, parentId: null, slug: "a", name: "A", tracks: 5, albums: 1 }, { id: 2, parentId: 1, slug: "b", name: "B", tracks: 5, albums: 1 }], { outer: false });
const w = buildRoom({ hull, slug: "a", name: "A", states: null, albums: [{ slug: "x", title: "X" }, { slug: "y", title: "Y" }], channelSlug: "c" });
let e: Eye = { ...w.spawn, pitch: 0 }; const d = startDrone(e);
// sits ahead and to the right
const h = droneHome({ x: 0, z: 0, yaw: 0, pitch: 0 }, 0); assert.ok(h.x > 1 && h.z > 0.4, "ahead (x) and right (z) at yaw 0");
// settles near home when you stand still, within a second
for (let i = 0; i < 90; i++) stepDrone(d, e, w, i / 60, 1 / 60);
const home = droneHome(e, 1.5); assert.ok(Math.hypot(d.x - home.x, d.z - home.z) < 0.15, "settled beside you");
// trails when you run, never leaves the room or enters a pedestal
let t = 0;
for (let i = 0; i < 3000; i++) { t += 1 / 60; e = stepEye(w, e, { forward: 1, strafe: 0, turn: i % 100 < 30 ? 1 : 0, look: 0, run: true }, 1 / 60).eye; stepDrone(d, e, w, t, 1 / 60);
  for (let k = 0; k < w.sides; k++) { const a = w.rot + (k + 0.5) * (2 * Math.PI / w.sides); assert.ok(d.x * Math.cos(a) + d.z * Math.sin(a) <= w.inr - 0.44, "inside walls"); }
  for (const p of w.props) assert.ok(Math.hypot(d.x - p.x, d.z - p.z) >= p.r + 0.34, "outside pedestals"); }
// idle drone stops moving (no repaint needed when nothing plays)
for (let i = 0; i < 600; i++) stepDrone(d, e, w, 100, 1 / 60); const before = { ...d }; let moved = false; for (let i = 0; i < 10; i++) moved = stepDrone(d, e, w, 100, 1 / 60) || moved; assert.ok(!moved && before.x === d.x, "at rest it does not move");
console.log("drone ok");
