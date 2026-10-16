// The Hidden switch in the rooms: a hidden member is not shown to anyone, not counted, and not found on a profile. Pure: runs without a server.
import { RoomHub, STALE_MS } from "../src/lib/roomHub.js";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const h = new RoomHub(), t0 = 2_000_000;

const ann = h.join(1, "ann", "core", t0, false)!;
const bob = h.join(2, "bob", "soundbay", t0, false)!;
const cy = h.join(3, "cy", "core", t0, true)!; // joined already hidden
h.pose(ann, { x: 1, z: 1, yaw: 0 }, t0); h.pose(bob, { x: 2, z: 2, yaw: 0 }, t0); h.pose(cy, { x: 3, z: 3, yaw: 0 }, t0);

ok(h.isHidden(cy) && !h.isHidden(ann), "a member who joined hidden is marked hidden, the others are not");
ok(h.others("core", bob).length === 1 && h.others("core", bob)[0].id === 1, "bob, in soundbay, sees ann in core and not cy (hidden)");
ok(h.others("core", ann).length === 0, "ann in core does not see cy, who is hidden in core");
ok(h.census(t0).total === 2 && h.census(t0).rooms === 2, "the census leaves hidden people out (ann and bob count, cy does not)");
ok(h.roomOf(1) === "core" && h.roomOf(2) === "soundbay", "find in room: ann is in core, bob in soundbay");
ok(h.roomOf(3) === null, "find in room: a hidden person is never found");
ok(h.roomOf(99) === null, "find in room: someone not in any room is not found");

// the switch flipped on: the open sockets follow at once
h.setHidden(1, true);
ok(h.isHidden(ann) && h.roomOf(1) === null, "switching to Hidden takes the person out of find in room at once");
ok(h.others("core", cy).length === 0 && h.census(t0).total === 1, "and out of the room's view and the totals");
// the switch flipped off again
h.setHidden(1, false);
ok(!h.isHidden(ann) && h.roomOf(1) === "core", "switching back makes the person findable again");
ok(h.others("core", bob).length === 1, "and bob sees ann again once she is visible");

// the room's list is told when someone flips: the dirty mark is set for their room
const h2 = new RoomHub();
const k = h2.join(7, "dee", "core", t0, false)!; h2.pose(k, { x: 0, z: 0, yaw: 0 }, t0);
h2.takeDirty();
h2.setHidden(7, true);
ok(h2.takeDirty().includes("core"), "switching to Hidden marks the room as changed so others drop them");
h2.setHidden(7, true);
ok(h2.takeDirty().length === 0, "setting Hidden again when it is already set changes nothing");

// a person with two tabs: hidden for both, found while visible on either
const h3 = new RoomHub();
const a = h3.join(8, "eve", "core", t0, false)!, b = h3.join(8, "eve", "soundbay", t0, false)!;
h3.setHidden(8, true);
ok(h3.isHidden(a) && h3.isHidden(b) && h3.roomOf(8) === null, "both tabs go hidden together");
ok(STALE_MS > 0, "stale members still leave by the sweep (the switch does not change that)");
console.log("roomHidden ok");
