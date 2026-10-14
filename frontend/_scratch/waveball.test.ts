import assert from "node:assert/strict";
import { computeProfile, encodeProfile, decodeProfile, heightAt, brightAt, hueOf, marksOf, nextMark, prevMark, markCrossed, scrubRate, ballOutline, WAVE_BINS } from "../src/lib/waveBall";
const sr = 22050, dur = 20, N = sr * dur, s = new Float32Array(N);
// rising loudness, rising pitch (200 Hz -> 4 kHz)
let ph = 0; for (let i = 0; i < N; i++) { const u = i / N, f = 200 * Math.pow(20, u); ph += (2 * Math.PI * f) / sr; s[i] = Math.sin(ph) * (0.05 + 0.9 * u * u); }
const p = computeProfile(s, sr);
assert.equal(p.amp.length, WAVE_BINS);
assert.ok(p.amp[100] < p.amp[400] && p.amp[400] < p.amp[700], "louder later");
assert.ok(p.cen[100] < p.cen[400] && p.cen[400] < p.cen[700], `brighter later ${p.cen[100]} ${p.cen[400]} ${p.cen[700]}`);
assert.ok(Math.max(...p.amp) === 255);
// silence is flat and dark
const q = computeProfile(new Float32Array(sr * 5), sr); assert.ok(q.amp.every((v) => v === 0) && q.cen.every((v) => v === 0));
// roundtrip, and a wrong length is refused
const e = encodeProfile(p), d = decodeProfile(e)!; assert.deepEqual([...d.amp], [...p.amp]); assert.deepEqual([...d.cen], [...p.cen]);
assert.equal(decodeProfile("AAAA"), null); assert.equal(decodeProfile("%%%"), null);
// terrain
assert.ok(Math.abs(heightAt(p, 0, dur) - p.amp[0] / 255) < 1e-9 && heightAt(p, dur, dur) <= 1);
const mid = heightAt(p, (10.0), dur); assert.ok(mid >= 0 && mid <= 1);
assert.ok(brightAt(p, 2, dur) < brightAt(p, 18, dur));
assert.ok(hueOf(0) > hueOf(1) && hueOf(0) <= 262 && hueOf(1) >= 40);
// save points
const m = marksOf([{ label: "b", timestampSeconds: 12 }, { label: "a", timestampSeconds: 3 }, { label: "x", timestampSeconds: 99 }], dur);
assert.deepEqual(m.map((x) => x.label), ["a", "b"]);
assert.equal(nextMark(m, 0)!.label, "a"); assert.equal(nextMark(m, 3)!.label, "b"); assert.equal(nextMark(m, 12), null);
assert.equal(prevMark(m, 20)!.label, "b"); assert.equal(prevMark(m, 12.2)!.label, "a"); assert.equal(prevMark(m, 2), null);
assert.equal(markCrossed(m, 2.9, 3.1)!.label, "a"); assert.equal(markCrossed(m, 3.1, 2.9)!.label, "a"); assert.equal(markCrossed(m, 4, 5), null); assert.equal(markCrossed(m, 0, 15), null);
// scrub
assert.equal(scrubRate(0, 5), 1); assert.ok(scrubRate(1, 0) < 1 && scrubRate(1, 2) === 6 && scrubRate(-1, 2) === -6);
// outline
const o = new Float64Array(24); ballOutline(0, 0, 24, o); assert.ok(o.every((v) => v === 1));
ballOutline(1, 0, 24, o); assert.ok(Math.max(...o) > 1.2 && Math.min(...o) >= 0.7);
console.log("waveball ok");
