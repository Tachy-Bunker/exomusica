import { probeColorsProblem, scanProblem, DEFAULT_PROBE_COLORS } from "../src/lib/probe.js";
import assert from "node:assert/strict";
assert.equal(probeColorsProblem(null), null); assert.equal(probeColorsProblem(DEFAULT_PROBE_COLORS), null);
assert.ok(probeColorsProblem({ ...DEFAULT_PROBE_COLORS, lore: "red" })); assert.ok(probeColorsProblem({ lore: "#ffffff" })); assert.ok(probeColorsProblem([])); assert.ok(probeColorsProblem({ ...DEFAULT_PROBE_COLORS, extra: "#ffffff" })); assert.ok(probeColorsProblem("x"));
assert.equal(scanProblem({ kind: "lore", key: "study:beating-tones" }), null); assert.equal(scanProblem({ kind: "person", key: "user:ghost9" }), null);
assert.ok(scanProblem({ kind: "evil", key: "a:b" })); assert.ok(scanProblem({ kind: "lore", key: "nocolon" })); assert.ok(scanProblem({ kind: "lore", key: "a:" + "x".repeat(101) })); assert.ok(scanProblem({ kind: "lore", key: "a:<script>" })); assert.ok(scanProblem({}));
console.log("ok");
