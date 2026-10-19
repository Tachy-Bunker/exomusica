// Map checks (P7): each check fires on a map built to break it, and a sound map gives no problems.
import assert from "node:assert/strict";
import { checkMap, countChecks, type CheckIssue } from "../src/lib/roomCheck.js";
import { layoutHull, type HullNode, type MapLink } from "../src/lib/hullLayout.js";
import type { Milestone } from "../src/lib/milestones.js";
import type { RoomDoc, Actor } from "../src/lib/roomDoc.js";

const M = (key: string, reached: boolean): Milestone => ({ key, title: key, perk: "p", metric: "TRACKS", label: "t", target: 1, now: 1, reached, reachedAt: null, live: true });
const actor = (id: string, kind: string, x: number, z: number, extra: Partial<Actor> = {}): Actor => ({ id, kind, name: id, x, z, w: 0.5, d: 0.5, h: 1, rot: 0, sides: 0, color: "#ffffff", on: true, pulse: 0, text: "", lore: "", img: 0, mode: 0, visor: false, prop: "", gate: "", gateOff: false, ...extra } as Actor);
const doc = (actors: Actor[], wires: RoomDoc["wires"] = []): RoomDoc => ({ v: 1, version: 1, actors, wires, tex: [], floor: [], bands: [], grade: null, ceil: 0, sky: null, flock: null, inherit: true, cfloor: 0, cwall: 0, dress: 2, shafts: 0, trim: null, hum: 0 } as unknown as RoomDoc);
const has = (list: CheckIssue[], room: string | null, level: string, part: string) => list.some((c) => c.room === room && c.level === level && c.text.includes(part));

// 1. a sound map: nothing to report
const clean: HullNode[] = [
  { id: 1, parentId: null, slug: "core", name: "Core", tracks: 3, albums: 1 },
  { id: 2, parentId: 1, slug: "a", name: "A", tracks: 2, albums: 1 },
];
assert.deepEqual(checkMap({ hull: layoutHull(clean, { outer: false }), links: [], milestones: [], docs: new Map() }), [], "a linked map with no content problems is clean");

// 2. the main problems on one map
const nodes: HullNode[] = [
  { id: 1, parentId: null, slug: "core", name: "Core", tracks: 3, albums: 1 },
  { id: 2, parentId: 1, slug: "a", name: "A", tracks: 2, albums: 1 },
  { id: 3, parentId: null, slug: "b", name: "B", tracks: 2, albums: 1 },
  { id: 4, parentId: 1, slug: "s", name: "S", tracks: 1, albums: 1, secret: true, key: "", gate: "" },
];
const hull = layoutHull(nodes, { outer: true });
const docs = new Map<string, RoomDoc | null>([
  ["core", doc([actor("crate", "solid", 0, 0), actor("lamp", "light", 1, 0, { gate: "m-missing" }), actor("far", "solid", 900, 0)],
    [{ from: "crate", ev: "zzz", to: "lamp", msg: "toggle", delay: 0, once: false, arg: "" }, { from: "crate", ev: "start", to: "ghost", msg: "toggle", delay: 0, once: false, arg: "" }] as RoomDoc["wires"])],
  ["a", doc(Array.from({ length: 151 }, (_, i) => actor(`p${i}`, "solid", 0, 0)))],
]);
const list = checkMap({ hull, links: [{ id: 1, fromSlug: "core", toSlug: "ghost", kind: "lift", gate: "" } as MapLink], milestones: [M("m-ring", true)], docs });
assert.ok(has(list, "b", "error", "No walk path from the Core"), "a room with no link to the Core is unreachable");
assert.ok(has(list, "core", "error", "Lift to ghost, which is not on the map"), "a lift to a missing room");
assert.ok(has(list, "core", "error", "a wire joins ghost") || has(list, "core", "error", "A wire joins ghost"), "a wire to a missing actor");
assert.ok(has(list, "core", "error", 'uses the event "zzz"'), "a wire with an event the actor does not have");
assert.ok(has(list, "core", "error", 'waits for "m-missing"'), "a gate that is not a milestone");
assert.ok(has(list, "core", "warn", "stands outside the walls: far"), "an actor outside the walls");
assert.ok(has(list, "a", "error", "151 actors: the room keeps 150"), "more actors than the cap");
assert.ok(has(list, "s", "warn", "Sealed room with no gate"), "a sealed room with no gate");
assert.ok(list.findIndex((c) => c.level === "error") < list.findIndex((c) => c.level === "warn"), "errors are listed before warnings");

// 3. two rooms whose walls meet with no link: a note, not an error
const base = layoutHull([...clean, { id: 3, parentId: null, slug: "c", name: "C", tracks: 2, albums: 1 }], { outer: false });
const a = base.rooms.find((r) => r.slug === "a")!, c = base.rooms.find((r) => r.slug === "c")!;
const beside = layoutHull([...clean, { id: 3, parentId: null, slug: "c", name: "C", tracks: 2, albums: 1 }], { outer: false, overrides: [{ slug: "a", x: 30, z: 0, level: 0 }, { slug: "c", x: 30 + a.w / 2 + c.w / 2, z: 0, level: 0 }] });
const shared = checkMap({ hull: beside, links: [], milestones: [], docs: new Map() });
assert.ok(shared.some((x) => x.level === "info" && x.text.includes("share a wall but are not linked")), "walls that meet with no link are a note");
assert.ok(!shared.some((x) => x.level === "error" && x.room === "a" && x.text.includes("share")), "the note is not an error");

// 4. counts
assert.deepEqual(countChecks(list).error, list.filter((c) => c.level === "error").length, "the counts add up");
console.log("roomcheck: all checks passed");
