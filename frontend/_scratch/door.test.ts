import assert from "node:assert/strict";
import { lift, luminance, neon } from "../src/lib/legibleColor.js";
import { branchSlugOf, doorTarget, readyToOpen, sectionOf } from "../src/lib/doorRoute.js";
assert.equal(lift("#ffffff"), "#ffffff");
assert.equal(lift("#ff9d3c"), "#ff9d3c");
for (const c of ["#000000", "#101030", "#1a0a0a", "#220044", "#003300"]) { const l = lift(c); assert.ok(luminance(l) >= 0.24, c + " -> " + l); }
assert.equal(lift("nope"), "nope");
assert.ok(/^#[0-9a-f]{6}$/.test(lift("#123")));
// hue kept: a dark blue stays blue-dominant
const b = lift("#0000aa"); assert.ok(parseInt(b.slice(5, 7), 16) >= parseInt(b.slice(1, 3), 16));
assert.equal(sectionOf("/branch/x"), "branch"); assert.equal(sectionOf("/"), "");
assert.equal(branchSlugOf("/branch/ice-room"), "ice-room"); assert.equal(branchSlugOf("/chart"), null);
const ck = { button: 0, meta: false, ctrl: false, shift: false, alt: false, defaultPrevented: false };
const an = { href: "/chart", target: null, download: false, origin: "http://a", noDoor: false };
assert.equal(doorTarget(ck, an, "/field-log"), "/chart");
assert.equal(doorTarget(ck, an, "/chart/x"), null, "same section");
assert.equal(doorTarget({ ...ck, ctrl: true }, an, "/x"), null);
assert.equal(doorTarget({ ...ck, button: 1 }, an, "/x"), null);
assert.equal(doorTarget(ck, { ...an, target: "_blank" }, "/x"), null);
assert.equal(doorTarget(ck, { ...an, href: "http://other/chart" }, "/x"), null);
assert.equal(doorTarget(ck, { ...an, href: "http://a/chart?x=1#h" }, "/x"), "/chart?x=1#h");
assert.equal(doorTarget(ck, { ...an, noDoor: true }, "/x"), null);
assert.equal(doorTarget(ck, { ...an, href: "mailto:a@b.c" }, "/x"), null);
const r = { onTarget: true, inflight: 0, fog: false, quietMs: 160, closedMs: 300 };
assert.ok(readyToOpen(r));
for (const k of [{ onTarget: false }, { inflight: 1 }, { fog: true }, { quietMs: 80 }, { closedMs: 100 }]) assert.ok(!readyToOpen({ ...r, ...k }), JSON.stringify(k));
for (const c of ["#e2703f", "#4fa8e0", "#10102a", "#888888"]) { const n = neon(c); assert.ok(/^#[0-9a-f]{6}$/.test(n)); assert.ok(luminance(n) >= 0.11, c + " -> " + n); }
assert.equal(neon("zzz"), "zzz");
console.log("door ok");
