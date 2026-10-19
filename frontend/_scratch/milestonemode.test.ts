// Milestone test states (P8): a draft test runs under the list as it is, all reached, or none reached. The list is copied, never changed. Under each mode the same doors exist (same ids and places); only their state changes.
import assert from "node:assert/strict";
import { applyMsMode, reachedKeys, MS_MODES } from "../src/lib/milestoneMode.js";
import { layoutHull, type HullNode, type MapLink } from "../src/lib/hullLayout.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import type { RoomState } from "../src/lib/chart.js";
import type { Milestone } from "../src/lib/milestones.js";

const M = (key: string, reached: boolean): Milestone => ({ key, title: key, perk: "p", metric: "TRACKS", label: "t", target: 1, now: 1, reached, reachedAt: null, live: true });
const list = [M("m-gate", false), M("m-ring", true)];

// 1. the three modes, and the input is never changed
assert.deepEqual(MS_MODES, ["asis", "all", "none"]);
const asis = applyMsMode(list, "asis");
assert.deepEqual(asis.map((m) => m.reached), [false, true], "as is: the flags stay as they are");
assert.notEqual(asis, list, "as is is a copy, not the same array");
assert.deepEqual(applyMsMode(list, "all").map((m) => m.reached), [true, true], "all reached");
assert.deepEqual(applyMsMode(list, "none").map((m) => m.reached), [false, false], "none reached");
assert.deepEqual(list.map((m) => m.reached), [false, true], "the input list is untouched");
assert.deepEqual([...reachedKeys(list, "asis")].sort(), ["m-ring"], "as is: only the reached keys");
assert.deepEqual([...reachedKeys(list, "all")].sort(), ["m-gate", "m-ring"], "all: every key");
assert.equal(reachedKeys(list, "none").size, 0, "none: no key");

// 2. a gated corridor door follows the mode: all opens it, none locks it, as is follows the flag
const nodes: HullNode[] = [
  { id: 1, parentId: null, slug: "core", name: "Core", tracks: 3, albums: 1 },
  { id: 2, parentId: 1, slug: "vault", name: "Vault", tracks: 2, albums: 1 },
  { id: 3, parentId: null, slug: "annex", name: "Annex", tracks: 2, albums: 1 },
];
const base = layoutHull(nodes, { outer: false });
const vault = base.rooms.find((r) => r.slug === "vault")!, annex = base.rooms.find((r) => r.slug === "annex")!;
const placed = [{ slug: "vault", x: 20, z: 0, level: null }, { slug: "annex", x: 20 + vault.w / 2 + annex.w / 2, z: 0, level: null }];
const corridor: MapLink = { id: 1, fromSlug: "vault", toSlug: "annex", kind: "corridor", gate: "m-gate" };
const hall = layoutHull(nodes, { outer: false, overrides: placed, links: [corridor] });
const states = new Map<number, RoomState>([[annex.id, "visited"]]);
const world = (mode: "asis" | "all" | "none", flags: Milestone[]) => buildRoom({ hull: hall, slug: "vault", name: "Vault", states, albums: [], channelSlug: null, milestones: applyMsMode(flags, mode) });
// a locked door carries only its key (the neighbour's id); an open one carries the neighbour's slug
const doorState = (w: { doors: { toSlug: string | null; key?: string; state: string }[] }) => w.doors.find((d) => d.toSlug === "annex" || d.key === String(annex.id))!.state;

const gateShut = [M("m-gate", false)];
assert.equal(doorState(world("asis", gateShut)), "locked", "as is: the gate is not reached, locked");
assert.equal(doorState(world("all", gateShut)), "open", "all reached: the gated door opens");
const gateOpen = [M("m-gate", true)];
assert.equal(doorState(world("none", gateOpen)), "locked", "none reached: the gated door is locked even if the flag is set");
assert.equal(doorState(world("asis", gateOpen)), "open", "as is: open when the flag is set");

// 3. the same doors under every mode: same count, ids and places (the test patches only the states)
const ids = (w: { doors: { id: string; x: number; z: number }[] }) => w.doors.map((d) => `${d.id}@${d.x.toFixed(3)},${d.z.toFixed(3)}`).join("|");
assert.equal(ids(world("asis", gateShut)), ids(world("all", gateShut)), "all: same doors as as is");
assert.equal(ids(world("asis", gateShut)), ids(world("none", gateShut)), "none: same doors as as is");
console.log("milestonemode: all checks passed");
