// Map links (fix406): walls that meet within 0.1 m link by position; a stored corridor joins two rooms and carries a gate; a gated corridor's door stays locked until its milestone; a lift lists only its own destinations when it has any.
import assert from "node:assert/strict";
import { alignedDocks, dockOf, dockSnap, layoutHull, DOCK_TOL, type HullNode, type MapLink } from "../src/lib/hullLayout.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import { liftDestinations } from "../src/lib/mapLinks.js";
import type { RoomState } from "../src/lib/chart.js";
import type { Milestone } from "../src/lib/milestones.js";

const M = (key: string, reached: boolean): Milestone => ({ key, title: key, perk: "p", metric: "TRACKS", label: "t", target: 1, now: 1, reached, reachedAt: null, live: true });
const box = (x: number, z: number, w = 4, d = 4) => ({ x, z, w, d });

// 1. the middle of each wall
const [n, e] = [dockOf({ ...box(0, 0, 4, 6) }, "N"), dockOf({ ...box(0, 0, 4, 6) }, "E")];
assert.deepEqual(n, [0, -3], "north wall middle");
assert.deepEqual(e, [2, 0], "east wall middle");

// 2. walls that meet within DOCK_TOL link; 0.25 m apart do not
assert.equal(DOCK_TOL, 0.1);
assert.deepEqual(alignedDocks(box(0, 0), box(4.05, 0)), ["E", "W"], "walls 0.05 m apart meet");
assert.equal(alignedDocks(box(0, 0), box(4.25, 0)), null, "walls 0.25 m apart do not meet");
assert.deepEqual(alignedDocks(box(0, 0), box(0, 4)), ["S", "N"], "stacked to the south: the south wall of one meets the north wall of the other");

// 3. dragging near a wall snaps exactly onto it; far away there is no snap
const snapped = dockSnap(4.6, 0.3, { w: 4, d: 4 }, [{ slug: "a", ...box(0, 0) }]);
assert.ok(snapped, "a drag 0.67 m from the spot snaps");
assert.equal(snapped!.to, "a"); assert.equal(snapped!.side, "E");
assert.equal(snapped!.x, 4); assert.equal(snapped!.z, 0);
assert.deepEqual(alignedDocks({ ...box(snapped!.x, snapped!.z) }, box(0, 0)), ["W", "E"], "after the snap the walls meet");
assert.equal(dockSnap(10, 10, { w: 4, d: 4 }, [{ slug: "a", ...box(0, 0) }]), null, "far away: no snap");

// 4. corridors in the hull: stored once, carry their gate, never double a tree link, and a pair that is not aligned still gets a pipe
const nodes: HullNode[] = [
  { id: 1, parentId: null, slug: "core", name: "Core", tracks: 3, albums: 1 },
  { id: 2, parentId: 1, slug: "vault", name: "Vault", tracks: 2, albums: 1 },
  { id: 3, parentId: null, slug: "annex", name: "Annex", tracks: 2, albums: 1 },
];
const base = layoutHull(nodes, { outer: false });
const vault = base.rooms.find((r) => r.slug === "vault")!, annex = base.rooms.find((r) => r.slug === "annex")!;
const corridor = (a: string, b: string, gate = ""): MapLink => ({ id: 1, fromSlug: a, toSlug: b, kind: "corridor", gate });
const placed = [{ slug: "vault", x: 20, z: 0, level: null }, { slug: "annex", x: 20 + vault.w / 2 + annex.w / 2, z: 0, level: null }];
const hall = layoutHull(nodes, { outer: false, overrides: placed, links: [corridor("vault", "annex", "m-gate")] });
const cor = hall.links.filter((l) => l.corridor);
assert.equal(cor.length, 1, "one corridor link");
assert.equal(cor[0].gate, "m-gate", "the corridor carries its gate");
assert.equal(cor[0].pts.length, 2, "aligned walls join straight (two points)");
assert.ok(Math.abs(cor[0].pts[0][1] - cor[0].pts[1][1]) < 1e-9, "the straight corridor is level");
const tree = layoutHull(nodes, { outer: false, links: [corridor("core", "vault")] });
assert.equal(tree.links.filter((l) => l.corridor).length, 0, "a corridor between tree neighbours is not doubled");
const apart = layoutHull(nodes, { outer: false, overrides: [{ slug: "vault", x: 20, z: 0, level: null }, { slug: "annex", x: -20, z: 9, level: null }], links: [corridor("vault", "annex")] });
const bent = apart.links.filter((l) => l.corridor);
assert.equal(bent.length, 1, "unaligned rooms still get a corridor");
assert.ok(bent[0].pts.length >= 2, "an unaligned corridor has a path");
assert.equal(bent[0].gate ?? "", "", "no gate");

// 5. the door of a gated corridor is locked (gated) until its milestone is reached, then opens
const states = new Map<number, RoomState>([[annex.id, "visited"]]);
// a locked door carries no slug (only its key, the neighbour's id); an open one carries the slug
const doorTo = (w: { doors: { toSlug: string | null; key?: string }[] }, id: number) => w.doors.find((d) => d.toSlug === "annex" || d.key === String(id));
const shut = buildRoom({ hull: hall, slug: "vault", name: "Vault", states, albums: [], channelSlug: null, milestones: [M("m-gate", false)] });
const dShut = doorTo(shut, annex.id);
assert.ok(dShut, "vault has a door to annex");
assert.equal(dShut!.state, "locked", "the gate is not reached: locked");
assert.equal(dShut!.gated, true, "the locked corridor door is gated (amber)");
assert.equal(dShut!.milestone?.key, "m-gate", "its card is the gate's milestone");
const open = buildRoom({ hull: hall, slug: "vault", name: "Vault", states, albums: [], channelSlug: null, milestones: [M("m-gate", true)] });
const dOpen = doorTo(open, annex.id);
assert.equal(dOpen!.state, "open", "the gate is reached: open");
assert.equal(dOpen!.gated, false, "an open corridor door is not gated");
const unseen = buildRoom({ hull: hall, slug: "vault", name: "Vault", states: new Map<number, RoomState>(), albums: [], channelSlug: null, milestones: [M("m-gate", true)] });
assert.equal(doorTo(unseen, annex.id)!.state, "locked", "an unvisited neighbour stays locked whatever the gate");

// 6. the lift cabin: its own destinations when it has any (behind their gates), else every open room
const names = new Map([["vault", "Vault"], ["annex", "Annex"], ["core", "Core"]]);
const defaults = [{ slug: "core", name: "Core" }, { slug: "annex", name: "Annex" }];
const lift = (from: string, to: string, gate = ""): MapLink => ({ id: 9, fromSlug: from, toSlug: to, kind: "lift", gate });
assert.deepEqual(liftDestinations("vault", [], names, new Set(), defaults), defaults, "no rows: the default open rooms");
assert.deepEqual(liftDestinations("vault", [lift("vault", "annex")], names, new Set(), defaults), [{ slug: "annex", name: "Annex" }], "its own list");
assert.deepEqual(liftDestinations("vault", [lift("vault", "annex", "m-gate")], names, new Set(), defaults), [], "a destination behind an unreached gate is not offered");
assert.deepEqual(liftDestinations("vault", [lift("vault", "annex", "m-gate")], names, new Set(["m-gate"]), defaults), [{ slug: "annex", name: "Annex" }], "behind a reached gate it is offered");
assert.deepEqual(liftDestinations("vault", [lift("vault", "ghost")], names, new Set(), defaults), [], "a row for a room not on the map is skipped");
assert.deepEqual(liftDestinations("core", [lift("vault", "annex")], names, new Set(), defaults), defaults, "another room's rows do not change this cabin");
console.log("maplinks: all checks passed");
