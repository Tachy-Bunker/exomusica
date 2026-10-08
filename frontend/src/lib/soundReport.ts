// A one-pass "what is in this sound?" report, computed entirely in the visitor's browser (nothing is uploaded).
// Pure functions on sample arrays - no DOM - so it runs in a worker and each part is tested against signals with a known right answer.
// Built to stay cheap on weak devices: every pass streams over the samples (no full-length copies), and every
// per-frame measurement is capped to a fixed number of frames however long the file is.

import { computeSpectrogram, computePeaks, fft, hann, spectrogramPixels, suggestMaxHz } from "./audioAnalysis";
import { detectOnsets, kWeighting, spectralCentroid, yinPitch } from "./analysis";

export const MAX_ANALYSIS_SEC = 600;

export interface StereoInfo {
  /** -1..1: +1 the channels are identical (mono), 0 unrelated, negative = out of phase (cancels in mono). */
  correlation: number;
  /** Side energy relative to mid energy in dB: very low = near mono, near 0 = very wide. */
  widthDb: number;
}

export interface TempoGuess { bpm: number; confidence: number }
export interface KeyGuess { name: string; confidence: number }

export interface SoundReport {
  fileName: string;
  duration: number;
  sampleRate: number;
  truncated: boolean;
  /** The file was decoded at a reduced rate to save memory: nothing above half this was measured. */
  reducedRate: boolean;
  stereo: StereoInfo | null;
  peakDb: number;
  rmsDb: number;
  crestDb: number;
  dc: number;
  clipped: number;
  silentFraction: number;
  lufs: number | null;
  /** Spread of the loudness over time in LU (10th to 95th percentile of the 400 ms readings): how much it breathes. */
  loudnessRange: number | null;
  pitch: { medianHz: number; lowHz: number; highHz: number; voicedFraction: number; note: string } | null;
  centroidHz: number | null;
  rolloffHz: number;
  tempo: TempoGuess | null;
  key: KeyGuess | null;
  onsets: number;
  /** One-third-octave bands: centre frequency and level in dB below the loudest band (0 = loudest). */
  bands: { hz: number; db: number }[];
  /** Highest frequency with real energy when everything above it is silent: the signature of a lossy encode. */
  cutoffHz: number | null;
  peaks: Float32Array;
  loudSeries: { t: number; v: number | null }[];
  spectrogram: { rgba: Uint8ClampedArray; width: number; height: number; maxHz: number };
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-10));

export function noteName(hz: number): string {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const n = Math.round(midi);
  const cents = Math.round((midi - n) * 100);
  const name = NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  return cents === 0 ? name : `${name} ${cents > 0 ? "+" : "−"}${Math.abs(cents)}c`;
}

// ------------------------------------------------------------------ levels (one pass)

export function levels(samples: Float32Array, sr: number) {
  let peak = 0, sumSq = 0, sum = 0, clipped = 0;
  const block = Math.max(1, Math.round(0.05 * sr));
  let silent = 0, blocks = 0, bSq = 0, bN = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    if (a >= 0.9995) clipped++;
    sumSq += v * v;
    sum += v;
    bSq += v * v;
    if (++bN === block) {
      blocks++;
      if (bSq / bN < 1e-12) silent++; // under -60 dBFS
      bSq = 0;
      bN = 0;
    }
  }
  const n = Math.max(1, samples.length);
  const rms = Math.sqrt(sumSq / n);
  return { peakDb: toDb(peak), rmsDb: toDb(rms), crestDb: toDb(peak) - toDb(rms), dc: sum / n, clipped, silentFraction: blocks ? silent / blocks : 0 };
}

// ------------------------------------------------------------------ loudness (streaming BS.1770 / EBU R128)

/**
 * Same measurement as `loudness()` in analysis.ts, but filters sample by sample and keeps only 100 ms energy sums, so a
 * ten-minute file costs a few kilobytes instead of hundreds of megabytes. Also returns the loudness range.
 */
export function streamLoudness(samples: Float32Array, sr: number) {
  const { shelf, highpass } = kWeighting(sr);
  let s1 = 0, s2 = 0, t1 = 0, t2 = 0; // transposed direct form II states
  const sub = Math.max(1, Math.round(0.1 * sr));
  const subEnergy: number[] = [];
  let acc = 0, cnt = 0;
  const [sb0, sb1, sb2] = shelf.b, [, sa1, sa2] = shelf.a;
  const [hb0, hb1, hb2] = highpass.b, [, ha1, ha2] = highpass.a;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = sb0 * x + s1;
    s1 = sb1 * x - sa1 * y + s2;
    s2 = sb2 * x - sa2 * y;
    const z = hb0 * y + t1;
    t1 = hb1 * y - ha1 * z + t2;
    t2 = hb2 * y - ha2 * z;
    acc += z * z;
    if (++cnt === sub) { subEnergy.push(acc / cnt); acc = 0; cnt = 0; }
  }
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const series: { t: number; v: number | null }[] = [];
  const energies: number[] = [];
  for (let b = 0; b + 4 <= subEnergy.length; b++) {
    const ms = (subEnergy[b] + subEnergy[b + 1] + subEnergy[b + 2] + subEnergy[b + 3]) / 4;
    energies.push(ms);
    series.push({ t: (b + 2) * 0.1, v: ms > 1e-12 ? lufs(ms) : null });
  }
  const abs = energies.filter((e) => e > 1e-12 && lufs(e) > -70);
  let integrated: number | null = null;
  let range: number | null = null;
  if (abs.length > 0) {
    const gate = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const rel = abs.filter((e) => lufs(e) > gate);
    if (rel.length > 0) integrated = lufs(rel.reduce((a, b) => a + b, 0) / rel.length);
    // range: the spread of the readings that are not near-silent (more than 20 LU under the average is dropped)
    const gate2 = (integrated ?? lufs(abs.reduce((a, b) => a + b, 0) / abs.length)) - 20;
    const vals = abs.map(lufs).filter((v) => v > gate2).sort((a, b) => a - b);
    if (vals.length >= 10) range = vals[Math.floor(vals.length * 0.95)] - vals[Math.floor(vals.length * 0.1)];
  }
  return { integrated, range, series };
}

// ------------------------------------------------------------------ tempo

/** Looks at the gaps between onsets (not just neighbours) and finds the pulse most gaps are a multiple of. */
export function estimateTempo(times: number[], strength: number[]): TempoGuess | null {
  if (times.length < 8) return null;
  const hist = new Float64Array(400); // 0.5 BPM bins from 60 to 260 -> folded into 70..160 below
  let total = 0;
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length && times[j] - times[i] < 3; j++) {
      const d = times[j] - times[i];
      if (d < 0.12) continue;
      let bpm = 60 / d;
      while (bpm < 70) bpm *= 2;
      while (bpm >= 160) bpm /= 2;
      const w = (strength[i] ?? 1) * (strength[j] ?? 1);
      const bin = Math.round((bpm - 60) * 2);
      if (bin >= 0 && bin < hist.length) { hist[bin] += w; total += w; }
    }
  }
  if (total <= 0) return null;
  let best = -1, bestV = 0;
  for (let b = 2; b < hist.length - 2; b++) {
    const v = hist[b - 2] * 0.5 + hist[b - 1] + hist[b] + hist[b + 1] + hist[b + 2] * 0.5;
    if (v > bestV) { bestV = v; best = b; }
  }
  if (best < 0) return null;
  return { bpm: Math.round(((60 + best / 2) * 10)) / 10, confidence: Math.min(1, bestV / total / 0.5) };
}

// ------------------------------------------------------------------ spectrum, key, cutoff

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Krumhansl-Schmuckler: which of the 24 keys' note profiles the pitch-class energy resembles most. */
export function keyFromChroma(chroma: number[]): KeyGuess | null {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  if (Math.max(...chroma) / total > 0.5) return null; // one note (or its octaves) is not a key
  let best = { r: -2, name: "" };
  for (let k = 0; k < 12; k++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - k + 12) % 12]);
    const rMaj = correlate(chroma, rot(MAJOR));
    const rMin = correlate(chroma, rot(MINOR));
    if (rMaj > best.r) best = { r: rMaj, name: `${NOTE_NAMES[k]} major` };
    if (rMin > best.r) best = { r: rMin, name: `${NOTE_NAMES[k]} minor` };
  }
  return { name: best.name, confidence: Math.max(0, Math.min(1, best.r)) };
}

/** Averaged power spectrum (Welch) over at most `maxFrames` evenly spread frames. */
export function averageSpectrum(samples: Float32Array, N = 4096, maxFrames = 240): Float64Array {
  const win = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const out = new Float64Array(N / 2);
  const frames = Math.max(1, Math.min(maxFrames, Math.floor(samples.length / N)));
  const step = frames > 1 ? (samples.length - N) / (frames - 1) : 0;
  let used = 0;
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * step);
    if (start + N > samples.length && samples.length >= N) continue;
    for (let i = 0; i < N; i++) { re[i] = (samples[start + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }
  if (used) for (let k = 0; k < out.length; k++) out[k] /= used;
  return out;
}

export function spectrumFacts(power: Float64Array, sr: number, N: number) {
  const hz = (k: number) => (k * sr) / N;
  // one-third-octave bands
  const bandPower: { hz: number; p: number }[] = [];
  for (let fc = 25; fc <= Math.min(16000, sr / 2 / 1.12); fc *= Math.cbrt(2)) {
    const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6);
    let p = 0;
    for (let k = Math.max(1, Math.ceil((lo * N) / sr)); k < N / 2 && hz(k) < hi; k++) p += power[k];
    bandPower.push({ hz: Math.round(fc), p });
  }
  const maxP = Math.max(1e-30, ...bandPower.map((b) => b.p));
  const bands = bandPower.map((b) => ({ hz: b.hz, db: Math.max(-90, 10 * Math.log10(b.p / maxP + 1e-12)) }));
  // 85% rolloff
  let sum = 0;
  for (let k = 1; k < power.length; k++) sum += power[k];
  let acc = 0, rolloffHz = 0;
  for (let k = 1; k < power.length; k++) { acc += power[k]; if (acc >= sum * 0.85) { rolloffHz = hz(k); break; } }
  // lossy-encode signature: real energy up to some point, then nothing at all
  let cutoffHz: number | null = null;
  if (sr >= 40000 && bands.length > 6) {
    let last = -1;
    for (let i = 0; i < bands.length; i++) if (bands[i].db > -70) last = i;
    const above = bands.slice(last + 1);
    if (last >= 0 && above.length >= 2 && above.every((b) => b.db < -82) && bands[last].hz >= 11000 && bands[last].hz <= 20000) cutoffHz = bands[last].hz;
  }
  // pitch-class energy between 110 Hz and 3 kHz
  const chroma = new Array(12).fill(0);
  for (let k = Math.ceil((110 * N) / sr); k < N / 2 && hz(k) < 3000; k++) {
    const midi = Math.round(69 + 12 * Math.log2(hz(k) / 440));
    chroma[((midi % 12) + 12) % 12] += Math.sqrt(power[k]);
  }
  return { bands, rolloffHz, cutoffHz, chroma };
}

// ------------------------------------------------------------------ the report

const percentile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

export function measureSound(
  samples: Float32Array,
  sr: number,
  meta: { fileName: string; stereo?: StereoInfo | null; truncated?: boolean; reducedRate?: boolean },
  stage: (name: string) => void = () => {},
): SoundReport {
  const duration = samples.length / sr;
  stage("Levels");
  const lv = levels(samples, sr);
  stage("Loudness");
  const loud = streamLoudness(samples, sr);

  stage("Pitch");
  const p = yinPitch(samples, sr, 0, duration, { hopSec: 0.02 });
  const f0 = p.values.filter((v): v is number => v != null).sort((a, b) => a - b);
  const voiced = p.values.length ? f0.length / p.values.length : 0;
  const pitch = f0.length >= 5 ? { medianHz: percentile(f0, 0.5), lowHz: percentile(f0, 0.1), highHz: percentile(f0, 0.9), voicedFraction: voiced, note: noteName(percentile(f0, 0.5)) } : null;

  stage("Brightness");
  const c = spectralCentroid(samples, sr, 0, duration, { hopSec: 0.05 });
  const cs = c.values.filter((v): v is number => v != null);
  const centroidHz = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null;

  stage("Rhythm");
  // at most ~20 000 analysis frames, however long the file
  const hopSamples = Math.max(256, Math.round(samples.length / 20000));
  const on = detectOnsets(samples, sr, 0, duration, { hopSamples });
  const tempo = estimateTempo(on.times, on.strength);

  stage("Spectrum");
  const N = 4096;
  const power = averageSpectrum(samples, N);
  const sf = spectrumFacts(power, sr, N);
  const keyRaw = keyFromChroma(sf.chroma);
  const key = keyRaw && keyRaw.confidence >= 0.55 && voiced > 0.15 ? keyRaw : null;

  stage("Picture");
  const sp = computeSpectrogram(samples, sr, 0, duration, { columns: 640 });
  const px = spectrogramPixels(sp, 200, suggestMaxHz(sp));
  const step = Math.max(1, Math.floor(loud.series.length / 600));
  const loudSeries = loud.series.filter((_, i) => i % step === 0);

  return {
    fileName: meta.fileName,
    duration,
    sampleRate: sr,
    truncated: !!meta.truncated,
    reducedRate: !!meta.reducedRate,
    stereo: meta.stereo ?? null,
    ...lv,
    lufs: loud.integrated,
    loudnessRange: loud.range,
    pitch,
    centroidHz,
    rolloffHz: sf.rolloffHz,
    tempo: tempo && tempo.confidence >= 0.3 ? tempo : null,
    key,
    onsets: on.times.length,
    bands: sf.bands,
    cutoffHz: sf.cutoffHz,
    peaks: computePeaks(samples, 600),
    loudSeries,
    spectrogram: { rgba: px.rgba, width: px.width, height: px.height, maxHz: px.maxHz },
  };
}

// ------------------------------------------------------------------ plain language

export interface Finding { tone: "ok" | "note" | "warn"; text: string }

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(0).padStart(2, "0")}` : `${s.toFixed(1)} s`;
}
const f1 = (x: number) => (Math.abs(x) < 0.05 ? "0.0" : x.toFixed(1)).replace("-", "−");

export function describe(r: SoundReport): Finding[] {
  const out: Finding[] = [];
  if (r.truncated) out.push({ tone: "note", text: `Only the first ${Math.round(MAX_ANALYSIS_SEC / 60)} minutes were measured, to keep this fast on any device.` });
  if (r.reducedRate) out.push({ tone: "note", text: `Large file: measured at ${Math.round(r.sampleRate / 1000)} kHz to save memory, so nothing above ${Math.round(r.sampleRate / 2000)} kHz was looked at.` });
  if (r.clipped > 0 || r.peakDb > -0.1) out.push({ tone: "warn", text: `Clipping: ${r.clipped.toLocaleString()} sample${r.clipped === 1 ? "" : "s"} hit full scale (peak ${f1(r.peakDb)} dBFS). It will crackle if it was not made on purpose.` });
  else if (r.peakDb < -12) out.push({ tone: "note", text: `Peaks reach only ${f1(r.peakDb)} dBFS: a lot of headroom, or simply a quiet recording.` });
  if (r.lufs != null) {
    const l = r.lufs;
    const word = l > -9 ? "Very loud" : l > -14 ? "Loud, like a mastered release" : l > -23 ? "Moderate" : "Quiet";
    out.push({ tone: l > -9 ? "warn" : "ok", text: `${word}: ${f1(l)} LUFS${l > -9 ? ". Streaming services will turn this down." : l < -30 ? ". Expect to turn it up." : "."}` });
  }
  if (r.loudnessRange != null) out.push({ tone: "note", text: r.loudnessRange < 4 ? `Very even level (range ${f1(r.loudnessRange)} LU): heavily compressed or a steady texture.` : r.loudnessRange > 14 ? `Wide dynamics (range ${f1(r.loudnessRange)} LU): big gaps between quiet and loud.` : `Level range ${f1(r.loudnessRange)} LU.` });
  if (Math.abs(r.dc) > 0.005) out.push({ tone: "warn", text: `DC offset ${(r.dc * 100).toFixed(1)}%: the waveform is shifted off centre. A high-pass filter at 10 Hz removes it.` });
  if (r.silentFraction > 0.5) out.push({ tone: "note", text: `${Math.round(r.silentFraction * 100)}% of it is near-silent.` });
  if (r.pitch) {
    if (r.pitch.voicedFraction >= 0.5) out.push({ tone: "ok", text: `Mostly pitched: ${r.pitch.note} (${Math.round(r.pitch.medianHz)} Hz)${r.pitch.highHz - r.pitch.lowHz < 3 ? ", very steady." : `, mostly between ${Math.round(r.pitch.lowHz)} and ${Math.round(r.pitch.highHz)} Hz.`}` });
    else out.push({ tone: "note", text: `Partly pitched (${Math.round(r.pitch.voicedFraction * 100)}% of the time), around ${r.pitch.note}.` });
  } else out.push({ tone: "note", text: "No clear pitch: noise, texture or percussion." });
  if (r.key) out.push({ tone: "note", text: `Likely key: ${r.key.name} (a rough guess, ${Math.round(r.key.confidence * 100)}% match).` });
  if (r.tempo) out.push({ tone: "note", text: `Steady pulse around ${Math.round(r.tempo.bpm)} BPM${r.tempo.confidence < 0.5 ? " (loose)" : ""}.` });
  else if (r.onsets >= 8) out.push({ tone: "note", text: `${r.onsets} separate attacks but no steady pulse.` });
  if (r.centroidHz != null) out.push({ tone: "note", text: r.centroidHz < 500 ? `Dark: most energy sits low (centre of mass ${Math.round(r.centroidHz)} Hz).` : r.centroidHz > 3500 ? `Very bright: centre of mass ${(r.centroidHz / 1000).toFixed(1)} kHz.` : r.centroidHz > 1800 ? `Bright: centre of mass ${(r.centroidHz / 1000).toFixed(1)} kHz.` : `Balanced tone: centre of mass ${Math.round(r.centroidHz)} Hz.` });
  if (r.cutoffHz) out.push({ tone: "warn", text: `Nothing above ~${(r.cutoffHz / 1000).toFixed(1)} kHz: typical of an MP3/AAC source or a low-passed mix.` });
  if (r.stereo) {
    if (r.stereo.correlation < -0.2) out.push({ tone: "warn", text: `Channels are partly out of phase (${r.stereo.correlation.toFixed(2)}): it can thin out or vanish in mono.` });
    else if (r.stereo.correlation > 0.995) out.push({ tone: "note", text: "Both channels are identical: effectively mono." });
    else out.push({ tone: "note", text: `Stereo, correlation ${r.stereo.correlation.toFixed(2)}${r.stereo.widthDb > -6 ? " (very wide)" : ""}.` });
  }
  return out;
}

/** The numbers worth pasting into a study, as a Markdown table. */
export function reportToMarkdown(r: SoundReport): string {
  const rows: [string, string][] = [
    ["Duration", fmtTime(r.duration)],
    ["Sample rate", `${r.sampleRate} Hz`],
    ["Integrated loudness", r.lufs != null ? `${f1(r.lufs)} LUFS` : "n/a"],
    ["Loudness range", r.loudnessRange != null ? `${f1(r.loudnessRange)} LU` : "n/a"],
    ["Peak", `${f1(r.peakDb)} dBFS`],
    ["RMS", `${f1(r.rmsDb)} dBFS (crest ${f1(r.crestDb)} dB)`],
    ["Pitch", r.pitch ? `${r.pitch.note}, median ${Math.round(r.pitch.medianHz)} Hz (${Math.round(r.pitch.lowHz)}–${Math.round(r.pitch.highHz)} Hz), pitched ${Math.round(r.pitch.voicedFraction * 100)}%` : "none clear"],
    ["Brightness", r.centroidHz != null ? `${Math.round(r.centroidHz)} Hz spectral centroid, 85% rolloff ${Math.round(r.rolloffHz)} Hz` : "n/a"],
    ["Tempo", r.tempo ? `${Math.round(r.tempo.bpm)} BPM` : "no steady pulse"],
    ["Key (rough)", r.key ? r.key.name : "unclear"],
  ];
  if (r.stereo) rows.push(["Stereo correlation", r.stereo.correlation.toFixed(2)]);
  const lines = [`### Analysis: ${r.fileName}`, "", "| Measure | Value |", "|---|---|", ...rows.map(([a, b]) => `| ${a} | ${b} |`), "", ...describe(r).map((f) => `- ${f.text}`), "", "_Measured in the browser with XenoLab's Analyzer._"];
  return lines.join("\n");
}
