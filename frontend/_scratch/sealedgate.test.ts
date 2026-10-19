// A sealed room's door (fix404): it opens when the room has been found and its gate milestone is reached; with no gate, finding is enough; with no milestone list, it stays shut; the locked door names the milestone.
import assert from "node:assert/strict";
import { buildRoom } from "../src/lib/roomWorld.js";
import { layoutHull, type HullNode } from "../src/lib/hullLayout.js";
import { facing, milestoneDoorAt } from "../src/lib/roomView.js";
import type { Milestone } from "../src/lib/milestones.js";

const M = (key: string, title: string, reached: boolean): Milestone => ({ key, title, perk: "p", metric: "TRACKS", label: "tracks", target: 10, now: reached ? 10 : 3, reached, reachedAt: null, live: true });
const nodes = (gate: string | null): HullNode[] => [
  { id: 1, parentId: null, slug: "core", name: "Core", tracks: 0, albums: 0 },
  { id: 2, parentId: 1, slug: "vault", name: "Vault", secret: true, key: "k-vault", gate, tracks: 0, albums: 0 },
];
const hullFor = (gate: string | null) => layoutHull(nodes(gate), { outer: true });
const doorTo = (w: ReturnType<typeof buildRoom>) => w.doors.find((d) => d.kind === "sealed")!;
const build = (gate: string | null, found: boolean, ms: Milestone[] | null) => {
  const hull = hullFor(gate), vault = hull.rooms.find((r) => r.id === 2)!;
  return buildRoom({ hull, slug: "core", name: "Core", states: new Map([[2, found ? "visited" : "sealed"]]) as never, albums: [], channelSlug: null, milestones: ms });
};
const list = [M("m-tracks", "First hundred", false), M("m-scans", "Wide lens", true)];

// 1. gated, found, milestone not reached: shut, and the door names the milestone
const a = build("m-tracks", true, list), da = doorTo(a);
assert.equal(da.state, "locked"); assert.equal(da.toSlug, null);
assert.equal(da.milestone?.key, "m-tracks"); assert.equal(da.milestone?.reached, false);
assert.equal(facing(a, { x: da.x - da.nx * 1.7, z: da.z - da.nz * 1.7, yaw: Math.atan2(da.nz, da.nx), pitch: 0 }, 2.7)?.kind, "door");
// walking into it shows the milestone card (the milestone door path), not the bare "Sealed" toast
assert.equal(milestoneDoorAt(a, { x: da.x - da.nx * 0.5, z: da.z - da.nz * 0.5, yaw: 0, pitch: 0 }, { edge: da.edge })?.milestone?.key, "m-tracks");

// 2. gated, found, milestone reached: opens to the room
const b = build("m-tracks", true, [M("m-tracks", "First hundred", true)]), db = doorTo(b);
assert.equal(db.state, "open"); assert.equal(db.toSlug, "vault");
assert.equal(milestoneDoorAt(b, { x: db.x - db.nx * 0.5, z: db.z - db.nz * 0.5, yaw: 0, pitch: 0 }, { edge: db.edge }), null, "an open sealed door is a way through, not a card");

// 3. gated, not found: shut whatever the milestones say
const c = build("m-tracks", false, [M("m-tracks", "First hundred", true)]), dc = doorTo(c);
assert.equal(dc.state, "locked"); assert.equal(dc.milestone?.key, "m-tracks");

// 4. no gate: finding is enough (the old rule)
const d = build(null, true, list), dd = doorTo(d);
assert.equal(dd.state, "open"); assert.equal(dd.toSlug, "vault"); assert.equal(dd.milestone, undefined);

// 5. gated, found, but no milestone list to read: the gate stays shut
const e = build("m-tracks", true, null), de = doorTo(e);
assert.equal(de.state, "locked"); assert.equal(de.milestone?.key, "m-tracks"); assert.equal(de.milestone?.reached, false);

// 6. the gate is read from the milestone list by key, so a different milestone reached does not open it
const f = build("m-tracks", true, [M("m-scans", "Wide lens", true)]), df = doorTo(f);
assert.equal(df.state, "locked");

console.log("sealedgate ok");
