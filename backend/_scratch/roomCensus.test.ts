// The homepage's room totals: distinct people, sending positions, fresh only. Pure: runs without a server.
import { RoomHub, STALE_MS } from "../src/lib/roomHub.js";
const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const h = new RoomHub(), t0 = 1_000_000;
const a = h.join(1, "ann", "core", t0)!, b = h.join(2, "bob", "soundbay", t0)!;
ok(h.census(t0).total === 0 && h.census(t0).rooms === 0, "nobody who has not sent a position counts");
h.pose(a, { x: 0, z: 0, yaw: 0 }, t0); h.pose(b, { x: 1, z: 1, yaw: 0 }, t0);
ok(JSON.stringify(h.census(t0)) === JSON.stringify({ total: 2, rooms: 2 }), "two people in two rooms: 2 and 2");
const twoTabs = h.join(1, "ann", "soundbay", t0)!; h.pose(twoTabs, { x: 0, z: 0, yaw: 0 }, t0);
ok(h.census(t0).total === 2 && h.census(t0).rooms === 2, "the same person in two tabs counts once");
const stale = h.join(3, "cy", "core", t0)!; h.pose(stale, { x: 0, z: 0, yaw: 0 }, t0);
ok(h.census(t0 + STALE_MS + 1).total === 0 || h.census(t0 + STALE_MS + 1).total < 3, "people who went quiet drop out of the count");
const quiet = h.join(4, "dee", "core", t0)!;
ok(h.census(t0).total === 3, "someone who joined but never sent a position is not counted");
const out = JSON.stringify(h.census(t0));
ok(!out.includes("ann") && !out.includes("core") && !out.includes("soundbay"), "the totals carry no names and no room names");
console.log("roomCensus ok");
