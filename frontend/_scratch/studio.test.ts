import assert from "node:assert/strict";
import { FONT_CHARS, textColumns, synthSpectrogramText, synthXY, encodeWav, spectrogram, gradientTable } from "../src/lib/studioDsp.ts";
// every glyph is 7 rows and rectangular
const cols = textColumns(FONT_CHARS.replace(" ", ""));
assert.ok(cols.every((c) => c.length === 7));
assert.equal(textColumns("I").length, 6); assert.equal(textColumns("hi").length, textColumns("HI").length); assert.equal(textColumns("@@").length, 0);
// glyph sanity by rendering
const show = (t: string) => Array.from({ length: 7 }, (_, r) => textColumns(t).map((c) => (c[r] ? "#" : " ")).join("")).join("\n");
assert.equal(show("T").split("\n")[0].slice(0, 5), "#####"); assert.equal(show("L").split("\n")[6].slice(0, 5), "#####");
assert.equal(show("O").split("\n")[3].slice(0, 5), "#   #");
// the text really lands in the right place in a spectrogram: "T" has a bar on its top row (highest band) across 5 columns, then a stem
const sr = 22050, sig = synthSpectrogramText({ text: "T", sampleRate: sr, seconds: 1.2, fLow: 1000, fHigh: 8000, thickness: 3 });
assert.equal(sig.length, Math.round(1.2 * sr));
let peak = 0; for (const v of sig) peak = Math.max(peak, Math.abs(v)); assert.ok(peak > 0.5 && peak <= 0.9001, `peak ${peak}`);
const sp = spectrogram(sig, 1024, 256, 2000);
const bandAt = (f: number) => Math.round((f / (sr / 2)) * sp.bins);
const energy = (frame: number, f: number) => { const c = bandAt(f); let m = 0; for (let k = c - 12; k <= c + 12; k++) m = Math.max(m, sp.data[frame * sp.bins + k]); return m; };
// 6 columns + 4 pad slots over 1.2 s = 0.12 s each; column c sits in slot c+2. The T: columns 0,1 and 3,4 are only the top bar; column 2 is bar + stem.
const fps = sr / 256, at = (col: number) => Math.round(0.12 * (2 + col + 0.5) * fps);
assert.ok(energy(at(1), 7500) > 120, `top bar lit ${energy(at(1), 7500)}`);
assert.ok(energy(at(1), 4500) < 60 && energy(at(1), 1500) < 60, `outside the bar is dark ${energy(at(1), 4500)} ${energy(at(1), 1500)}`);
assert.ok(energy(at(2), 4500) > 120 && energy(at(2), 1500) > 120, "the stem of the T is lit through the middle and the bottom");
assert.ok(energy(1, 4500) < 20 && energy(sp.frames - 2, 4500) < 20, "silence before and after");
// XY: a square comes back as the same four corners on each channel
const sq = [100, 100, 900, 100, 900, 600, 100, 600];
const xy = synthXY({ strokes: [sq], sampleRate: 48000, seconds: 0.2, rate: 50 });
assert.equal(xy.l.length, 9600); let minL = 9, maxL = -9, minR = 9, maxR = -9; for (let i = 0; i < xy.l.length; i++) { minL = Math.min(minL, xy.l[i]); maxL = Math.max(maxL, xy.l[i]); minR = Math.min(minR, xy.r[i]); maxR = Math.max(maxR, xy.r[i]); }
assert.ok(Math.abs(minL - (-0.9 + 0.18)) < 0.01 && Math.abs(maxL - (0.9 - 0.18)) < 0.01, `x range ${minL} ${maxL}`);
assert.ok(maxR > 0 && minR < 0 && maxR > Math.abs(minR) - 0.5);
assert.equal(xy.l[0], xy.l[960]); // periodic at 50 Hz
assert.equal(synthXY({ strokes: [], sampleRate: 8000, seconds: 0.1, rate: 25 }).l.length, 800);
// WAV
const wav = encodeWav([new Float32Array([0, 1, -1, 0.5])], 8000, 16), dv = new DataView(wav.buffer);
assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF"); assert.equal(wav.length, 44 + 8); assert.equal(dv.getUint32(24, true), 8000); assert.equal(dv.getInt16(46, true), 32767); assert.equal(dv.getInt16(48, true), -32767);
const w24 = encodeWav([new Float32Array([1, -1]), new Float32Array([0, 0])], 44100, 24); assert.equal(w24.length, 44 + 2 * 2 * 3); assert.equal(new DataView(w24.buffer).getUint16(34, true), 24);
// FFT: a 1 kHz sine peaks in the right bin
const sine = new Float32Array(8192).map((_, i) => Math.sin((2 * Math.PI * 1000 * i) / 8000));
const ss = spectrogram(sine, 1024, 512); let best = 0; for (let k = 0; k < ss.bins; k++) if (ss.data[k] > ss.data[best]) best = k;
assert.ok(Math.abs(best - 128) <= 1, `bin ${best}`);
const gt = gradientTable(); assert.equal(gt.length, 768); assert.deepEqual([...gt.slice(0, 3)], [7, 7, 10]); assert.deepEqual([...gt.slice(765)], [242, 248, 255]);
console.log("studio ok");
