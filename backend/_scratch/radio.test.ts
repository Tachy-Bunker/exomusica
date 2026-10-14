import { covers, blockFor, autoBlock, runStart, runEnd, orderTracks, locate } from "../src/lib/radio.js";
import assert from "node:assert/strict";
assert.equal(covers({ startHour: 22, hours: 4 }, 1), true); assert.equal(covers({ startHour: 22, hours: 4 }, 2), false); assert.equal(covers({ startHour: 8, hours: 1 }, 8), true);
const bl = [{ startHour: 6, hours: 6, branchSlug: "a" }, { startHour: 22, hours: 4, branchSlug: "b" }];
assert.equal(blockFor(bl, 7)?.branchSlug, "a"); assert.equal(blockFor(bl, 0)?.branchSlug, "b"); assert.equal(blockFor(bl, 15), null);
assert.deepEqual(autoBlock(["x", "y"], 4), { startHour: 3, hours: 3, branchSlug: "y" }); assert.equal(autoBlock(["x", "y"], 6)?.branchSlug, "x"); assert.equal(autoBlock([], 3), null);
const t = Date.parse("2026-10-13T01:30:00Z");
assert.equal(runStart({ startHour: 22 }, t), Date.parse("2026-10-12T22:00:00Z")); assert.equal(runStart({ startHour: 1 }, t), Date.parse("2026-10-13T01:00:00Z"));
assert.equal(runEnd({ startHour: 22, hours: 4 }, t), Date.parse("2026-10-13T02:00:00Z"));
const tr = [{ id: 3, durationSeconds: 100 }, { id: 1, durationSeconds: 50 }, { id: 2, durationSeconds: null }, { id: 4, durationSeconds: 70 }];
const o = orderTracks(tr, "a-2026-10-13"); assert.equal(o.length, 3);
assert.deepEqual(o.map((x) => x.id), orderTracks([...tr].reverse(), "a-2026-10-13").map((x) => x.id), "same order for everyone, whatever the input order");
assert.notDeepEqual(orderTracks(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, durationSeconds: 10 })), "s1").map((x) => x.id), orderTracks(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, durationSeconds: 10 })), "s2").map((x) => x.id));
const ord = [{ id: 1, durationSeconds: 50 }, { id: 2, durationSeconds: 100 }, { id: 3, durationSeconds: 70 }];
let l = locate(ord, 0)!; assert.equal(l.track.id, 1); assert.equal(l.offset, 0); assert.equal(l.remaining, 50); assert.deepEqual(l.upcoming.map((x) => x.id), [2, 3]);
l = locate(ord, 60)!; assert.equal(l.track.id, 2); assert.equal(l.offset, 10); assert.equal(l.remaining, 90);
l = locate(ord, 220 + 5)!; assert.equal(l.track.id, 1); assert.equal(l.offset, 5);
assert.equal(locate(ord, -10)!.track.id, 3);
assert.deepEqual(locate([{ id: 9, durationSeconds: 30 }], 100)!.upcoming, []);
assert.equal(locate([], 5), null);
console.log("ok");

import { orderCrate, loopElapsed, STATION_EPOCH_MS, locate as loc2 } from "../src/lib/radio.js";
{
  const pl = (id: number, tracks: number[]) => ({ id, title: "P" + id, owner: "o" + id, slug: "p" + id, tracks: tracks.map((t) => ({ id: t, durationSeconds: 60 })) });
  const lists = [pl(1, [1, 2, 3]), pl(2, [4, 5]), pl(3, []), pl(4, [6]), { ...pl(5, [7]), tracks: [{ id: 7, durationSeconds: null }] }];
  const a = orderCrate(lists, "2026-10-14"), b = orderCrate([...lists].reverse(), "2026-10-14");
  assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id), "same order for everyone, whatever order the database returns");
  assert.equal(a.length, 6, "empty and unplayable playlists are left out");
  const bounds = a.map((e) => e.playlist.slug); // each playlist's tracks stay together, in order
  assert.ok(["p1", "p2", "p4"].every((s) => bounds.join(",").includes(Array(bounds.filter((x) => x === s).length).fill(s).join(","))));
  const p1 = a.filter((e) => e.playlist.slug === "p1").map((e) => e.id); assert.deepEqual(p1, [1, 2, 3]);
  assert.notDeepEqual(orderCrate(lists, "2026-10-15").map((e) => e.playlist.slug), a.map((e) => e.playlist.slug), "a new day, a new running order (very likely)");
  const at = loc2(a, 125); assert.equal(at!.track.id, a[2].id);
  assert.equal(at!.track.playlist.slug, a[2].playlist.slug);
  assert.equal(loopElapsed(STATION_EPOCH_MS + 5000), 5); assert.equal(loopElapsed(0), 0);
  assert.deepEqual(orderCrate([], "d"), []);
}
console.log("stations ok");
