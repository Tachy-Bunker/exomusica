import assert from "node:assert/strict";
import { cleanDoc, deliverAtFor, expiryFor, MAX_ITEMS } from "../src/lib/letters.ts";
assert.equal(cleanDoc(null).ok, false); assert.equal(cleanDoc({ items: [] }).ok, false); assert.equal(cleanDoc({ items: "x" }).ok, false);
const ok = cleanDoc({ bg: "weird", items: [
  { t: "s", c: "#ff0000", w: 99, p: [1, 2, 3, 4, 5000, -9, "a"] },
  { t: "x", x: 5, y: 5, r: 999, s: 1, c: "#e5484d", k: 500, v: "  hi\u0007there  " },
  { t: "m", x: 1, y: 1, r: 0, s: 80, c: "#1b1b1f", g: "cq" },
  { t: "m", g: "nope" }, { t: "x", v: "   " }, { t: "s", p: [1] }, "junk", { t: "evil", onload: 1 } ] });
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.doc.bg, "paper"); assert.equal(ok.doc.items.length, 3);
  const s = ok.doc.items[0]; assert.ok(s.t === "s" && s.c === "#1b1b1f" && s.w === 14 && s.p.length === 6 && s.p[4] === 1000 && s.p[5] === 0);
  const x = ok.doc.items[1]; assert.ok(x.t === "x" && x.r === 180 && x.s === 10 && x.k === 100 && x.v === "hi there");
}
assert.equal(cleanDoc({ items: Array(MAX_ITEMS + 1).fill({ t: "m", g: "cq" }) }).ok, false);
const big = Array.from({ length: 11 }, () => ({ t: "s", p: Array(1200).fill(5) }));
assert.equal(cleanDoc({ items: big }).ok, false);
const now = new Date("2026-01-01T00:00:00Z");
assert.equal(deliverAtFor(5, now).toISOString(), "2026-01-01T05:00:00.000Z"); assert.equal(deliverAtFor(999, now).getTime() - now.getTime(), 72 * 3600e3); assert.equal(deliverAtFor("x", now).getTime(), now.getTime());
assert.equal(expiryFor(undefined, now).getTime() - now.getTime(), 30 * 86400e3);
console.log("letters ok");
