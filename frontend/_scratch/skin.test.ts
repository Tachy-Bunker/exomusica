import assert from "node:assert/strict";
import { applySkin, asSkin, contrast, SKINS } from "../src/lib/skin";
import { FORGOTTEN_DAYS, isForgotten } from "../src/lib/phazon";
for (const [id, s] of Object.entries(SKINS)) {
  const p = s.palette;
  assert.ok(contrast(p.text, p.bg) >= 7, id + " text");
  assert.ok(contrast(p.textDim, p.bg) >= 4.5, id + " dim");
  assert.ok(contrast(p.textDim, p.bgElevated) >= 4.5, id + " dim on elevated");
  assert.ok(contrast(p.accentForum, p.bg) >= 4.5, id + " forum");
  assert.ok(contrast(p.accentAudio, p.bg) >= 4.5, id + " audio");
  assert.ok(contrast(p.accentDanger, p.bg) >= 3, id + " danger");
}
assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.01);
assert.equal(asSkin("phazon"), "phazon"); assert.equal(asSkin("evil"), ""); assert.equal(asSkin(""), "");
// apply/clear on a stub root
const vars = new Map<string, string>(); const root = { style: { setProperty: (k: string, v: string) => vars.set(k, v), removeProperty: (k: string) => vars.delete(k) }, dataset: {} as Record<string, string> } as unknown as HTMLElement;
applySkin("phazon", root); assert.equal(vars.get("--bg"), SKINS.phazon.palette.bg); assert.equal(vars.get("--radius"), "2px"); assert.equal(root.dataset.skin, "phazon");
applySkin("", root); assert.equal(vars.size, 0); assert.equal(root.dataset.skin, undefined);
// forgotten threads
const now = 1_000_000_000, d = 86400;
assert.equal(isForgotten(null, null, now), false);
assert.equal(isForgotten(now - 10 * d, null, now), false);
assert.equal(isForgotten(now - (FORGOTTEN_DAYS + 1) * d, null, now), true);
assert.equal(isForgotten(now - 200 * d, now - 5 * d, now), false); // visiting clears it
assert.equal(isForgotten(now - 200 * d, now - 100 * d, now), true); // …for a while
console.log("skin ok");
