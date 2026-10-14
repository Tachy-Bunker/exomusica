import assert from "node:assert/strict";
import { recoveredHeader } from "../src/lib/recoveredLog";
const now = new Date("2026-10-14T12:00:00Z");
assert.deepEqual(recoveredHeader("2023-04-12", "drones", 37, now), { title: "Recovered: 2023-04-12, #drones", sub: "37 entries decoded · 3.5 years down" });
assert.equal(recoveredHeader("2026-10-13", "hall", 1, now).sub, "1 entry decoded · 1 day down");
assert.equal(recoveredHeader("2026-08-01", "hall", null, now).sub, "2 months down");
assert.equal(recoveredHeader("garbage", "hall", 2, now).sub, "2 entries decoded");
console.log("ok");
