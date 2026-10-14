import assert from "node:assert/strict";
import { buildPulses, pulseLevel } from "../src/lib/chartPulse.js";
assert.deepEqual([1, 2, 3, 4, 9, 10, 50].map(pulseLevel), [0, 1, 1, 2, 2, 3, 3]);
const B = [
  { id: 1, slug: "a", visibility: "VISIBLE" as const, chartHidden: false },
  { id: 2, slug: "secret", visibility: "HIDDEN" as const, chartHidden: false },
  { id: 3, slug: "off", visibility: "VISIBLE" as const, chartHidden: true },
  { id: 4, slug: "b", visibility: "BABY_CRYSTALS" as const, chartHidden: false },
];
const p = buildPulses([{ key: "branch:a", people: 5 }, { key: "branch:secret", people: 20 }, { key: "branch:off", people: 20 }, { key: "branch:b", people: 1 }, { key: "album:a", people: 9 }, { key: "branch:gone", people: 9 }], B);
assert.deepEqual(p, { 1: 2 });
console.log("chartpulse ok");
