import assert from "node:assert/strict";
import { creditsText, entryName, monthKey, pickPack, type PackCandidate } from "../src/lib/commonsPack.js";
const C = (id: number, size = 1000, over: Partial<PackCandidate> = {}): PackCandidate => ({ id, sizeBytes: size, title: `Song ${id}`, composer: "", permission: "FREE_REMIX", ext: "mp3", owner: "neo", ...over });
assert.equal(monthKey(new Date(Date.UTC(2026, 0, 31, 23, 59))), "2026-01");
assert.equal(monthKey(new Date(Date.UTC(2026, 11, 1))), "2026-12");
const all = Array.from({ length: 100 }, (_, i) => C(i + 1));
const a = pickPack(all, "2026-10"), b = pickPack([...all].reverse(), "2026-10"), c = pickPack(all, "2026-11");
assert.equal(a.length, 40);
assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id)); // same month, same pack, whatever the input order
assert.notDeepEqual(a.map((x) => x.id), c.map((x) => x.id)); // next month, a different draw
assert.equal(pickPack(all, "m", 40, 5000).length, 5); // size limit
assert.deepEqual(pickPack([C(1, 0), C(2, -5), C(3, 10)], "m").map((x) => x.id), [3]);
assert.equal(entryName(0, { title: "Ünï cödé / ../x", ext: "MP3" }), "01-Uni-code-x.mp3");
assert.equal(entryName(11, { title: "日本語", ext: "x/y" }), "12-track.bin");
const t = creditsText([C(1, 1, { composer: "Ann\nEvil", permission: "CREDIT_REQUIRED" })], "2026-10");
assert.ok(t.includes("by Ann Evil") && t.includes("CREDIT_REQUIRED") && t.includes("01-Song-1.mp3"));
console.log("commons ok");
