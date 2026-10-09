import assert from "node:assert/strict";
import { STRIP_BYTES, STRIP_H, STRIP_W, ffmpegArgs, normalizeStrip, runFfmpeg, stripCacheName, stripSource } from "../src/lib/specStrip.js";
import { cleanCommentBody, clampAt, groupPins } from "../src/lib/trackComments.js";
let n = 0; const ok = (name: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => { n++; });

await ok("cache name changes with the file address", () => {
  assert.notEqual(stripCacheName(1, "/uploads/a.mp3"), stripCacheName(1, "/uploads/b.mp3"));
  assert.equal(stripCacheName(1, "/uploads/a.mp3"), stripCacheName(1, "/uploads/a.mp3"));
});
await ok("source stays inside uploads", () => {
  assert.equal(stripSource("/uploads/../etc/passwd", "/app/uploads"), null);
  assert.equal(stripSource("/uploads/tracks/a.flac", "/app/uploads"), "/app/uploads/tracks/a.flac");
  assert.equal(stripSource("file:///etc/passwd", "/app/uploads"), null);
  assert.equal(stripSource("https://x.org/a.mp3", "/app/uploads"), "https://x.org/a.mp3");
});
await ok("args never allow other protocols", () => { const a = ffmpegArgs("x"); assert.equal(a[a.indexOf("-protocol_whitelist") + 1], "file,http,https,tcp,tls,crypto"); });
await ok("normalize stretches contrast and rejects wrong sizes", () => {
  assert.equal(normalizeStrip(new Uint8Array(10)), null);
  const raw = new Uint8Array(STRIP_BYTES).fill(10); for (let i = 0; i < 400; i++) raw[i] = 90;
  const out = normalizeStrip(raw)!; assert.equal(out[0], 255); assert.equal(out[STRIP_BYTES - 1], 0);
});
await ok("comment text is one clean short line", () => {
  assert.equal(cleanCommentBody("  hi\n\n\tthere\u0000 "), "hi there");
  assert.equal(cleanCommentBody("x".repeat(999)).length, 240);
  assert.equal(cleanCommentBody(null), "");
});
await ok("time is clamped", () => {
  assert.equal(clampAt(-5, 100), 0); assert.equal(clampAt(500, 100), 100); assert.equal(clampAt("abc", 100), 0); assert.equal(clampAt(12.345, null), 12.3);
});
await ok("pins group by nearness", () => {
  const g = groupPins([{ atSeconds: 10 }, { atSeconds: 11 }, { atSeconds: 50 }, { atSeconds: 2 }], 3);
  assert.deepEqual(g.map((x) => x.length), [1, 2, 1]);
});
await ok("real ffmpeg render: low tone early, high tone late", async () => {
  const raw = await runFfmpeg("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/two.wav");
  if (raw === "missing") { console.log("  (no ffmpeg here, skipped)"); return; }
  assert.ok(raw && raw.length === STRIP_BYTES);
  const s = normalizeStrip(raw!)!;
  const mean = (c0: number, c1: number, r0: number, r1: number) => { let t = 0, k = 0; for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { t += s[r * STRIP_W + c]; k++; } return t / k; };
  const rowOfMax = (c: number) => { let b = 0, bi = 0; for (let r = 0; r < STRIP_H; r++) if (s[r * STRIP_W + c] > b) { b = s[r * STRIP_W + c]; bi = r; } return bi; };
  const early = rowOfMax(200), late = rowOfMax(800);
  assert.ok(early > late, `low tone should sit lower on the strip (early row ${early}, late row ${late})`);
  assert.ok(mean(0, 1000, 0, 40) > 5);
});
await ok("missing/garbage input is a clean failure", async () => { const r = await runFfmpeg("/nonexistent.wav"); assert.ok(r === null || r === "missing"); });
console.log(`specstrip: ${n} ok`);
