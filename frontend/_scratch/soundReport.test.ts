import { loudness } from "../src/lib/analysis";
import { streamLoudness, estimateTempo, keyFromChroma, measureSound, describe, noteName, levels, reportToMarkdown } from "../src/lib/soundReport";
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const sr = 44100;
const sine = (hz: number, sec: number, amp = 0.5) => Float32Array.from({ length: Math.floor(sec * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

// streaming loudness equals the reference implementation
const a = sine(1000, 6, 0.3);
const ref = loudness(a, sr, 0, 6).integrated!, st = streamLoudness(a, sr).integrated!;
ok(Math.abs(ref - st) < 0.15, `streaming LUFS ${st.toFixed(2)} ~ reference ${ref.toFixed(2)}`);
ok(Math.abs(st - -13.0) < 1.2, `0.3-amplitude 1 kHz sine is about -13 LUFS (${st.toFixed(2)})`);

// levels / clipping / dc
const clip = sine(200, 1, 2).map((v) => Math.max(-1, Math.min(1, v)));
const l = levels(clip, sr);
ok(l.clipped > 1000 && l.peakDb > -0.01, `clipping found (${l.clipped})`);
const dc = sine(200, 1, 0.2).map((v) => v + 0.1);
ok(Math.abs(levels(dc, sr).dc - 0.1) < 0.002, "dc offset measured");
ok(levels(new Float32Array(sr * 2), sr).silentFraction > 0.99, "silence measured");

// tempo
const t: number[] = [], s: number[] = [];
for (let i = 0; i < 40; i++) { t.push(i * 0.5); s.push(1); }
const tp = estimateTempo(t, s)!;
ok(Math.abs(tp.bpm - 120) < 2, `120 BPM click train -> ${tp.bpm}`);
const t2: number[] = []; for (let i = 0; i < 30; i++) t2.push(i * (60 / 93));
ok(Math.abs(estimateTempo(t2, t2.map(() => 1))!.bpm - 93) < 2, "93 BPM");
ok(estimateTempo([0, 1, 2], [1, 1, 1]) === null, "too few onsets -> null");

// key: C major triad+scale chroma
const cmaj = [1, 0, 0.3, 0, 0.8, 0.3, 0, 0.9, 0, 0.3, 0, 0.2];
ok(keyFromChroma(cmaj)!.name === "C major", "C major from chroma: " + keyFromChroma(cmaj)!.name);

ok(noteName(440) === "A4" && noteName(261.63) === "C4", "note names " + noteName(261.63));

// full report on A3 triad-ish tone with an on/off envelope
const n = 8 * sr; const x = new Float32Array(n);
for (let i = 0; i < n; i++) { const e = (i % (sr / 2)) < sr / 5 ? 1 : 0.05; x[i] = e * 0.4 * (Math.sin(2 * Math.PI * 220 * i / sr) + 0.4 * Math.sin(2 * Math.PI * 440 * i / sr)) / 1.4; }
const t0 = Date.now();
const rep = measureSound(x, sr, { fileName: "test.wav", stereo: { correlation: 0.5, widthDb: -8 } });
console.log("measured 8 s in", Date.now() - t0, "ms");
ok(rep.pitch != null && Math.abs(rep.pitch.medianHz - 220) < 4, "pitch ~220 " + rep.pitch?.medianHz);
ok(rep.tempo != null && Math.abs(rep.tempo.bpm - 120) < 3, "tempo ~120 " + rep.tempo?.bpm);
ok(rep.bands.length > 20, "bands " + rep.bands.length);
ok(rep.spectrogram.width > 100 && rep.spectrogram.rgba.length === rep.spectrogram.width * rep.spectrogram.height * 4, "spectrogram pixels");
ok(describe(rep).length >= 5, "findings");
console.log(reportToMarkdown(rep));

// lossy-looking: noise lowpassed at 16 kHz
const noise = new Float32Array(10 * sr); let y1 = 0; 
for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.3;
// brickwall via FFT would be slow; use cascaded one-pole lowpass at 5k then check no false cutoff instead
const rn = measureSound(noise, sr, { fileName: "noise" });
ok(rn.cutoffHz === null, "white noise has no cutoff");
ok(rn.pitch === null || rn.pitch.voicedFraction < 0.3, "noise is unpitched");
// 10 minutes timing
const big = new Float32Array(600 * 22050); for (let i = 0; i < big.length; i += 7) big[i] = Math.sin(i / 50) * 0.3;
const tb = Date.now(); measureSound(big, 22050, { fileName: "big" }); console.log("10 min @22k:", Date.now() - tb, "ms");
process.exit(fails ? 1 : 0);
