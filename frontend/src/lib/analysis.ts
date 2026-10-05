// Measurements for a passage of audio: pitch contour, loudness, spectral
// centroid and note onsets. Plain functions on sample arrays (no DOM), so each
// can be tested against signals with a known right answer. Times returned are
// positions in the RECORDING (not relative to the passage), so a figure lines
// up with the clips that cite it.

import { fft, hann } from "./audioAnalysis";

export interface Measured {
  times: number[];
  values: (number | null)[];
}

const clampRange = (samples: Float32Array, sr: number, startSec: number, endSec: number): [number, number] => [Math.max(0, Math.floor(startSec * sr)), Math.min(samples.length, Math.ceil(endSec * sr))];
const dbfs = (ms: number) => 10 * Math.log10(ms + 1e-20);

/** Keeps a figure to a sensible number of points however long the passage is. */
export const MAX_POINTS = 1500;
export function hopFor(durationSec: number, wantedHopSec: number): number {
  return Math.max(wantedHopSec, durationSec / MAX_POINTS);
}

// ---------------------------------------------------------------- loudness (ITU-R BS.1770 / EBU R128)

interface Biquad {
  b: [number, number, number];
  a: [number, number, number];
}

/** The two K-weighting filters of BS.1770 for any sample rate (the standard only tabulates 48 kHz). */
export function kWeighting(fs: number): { shelf: Biquad; highpass: Biquad } {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  const f1 = 38.13547087602444;
  const Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / fs);
  const a01 = 1 + K1 / Q1 + K1 * K1;
  const highpass: Biquad = { b: [1, -2, 1], a: [1, (2 * (K1 * K1 - 1)) / a01, (1 - K1 / Q1 + K1 * K1) / a01] };
  return { shelf, highpass };
}

function biquad(x: Float64Array, c: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b[0] * x[i] + c.b[1] * x1 + c.b[2] * x2 - c.a[1] * y1 - c.a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export interface Loudness extends Measured {
  /** Gated integrated loudness of the passage in LUFS, or null if it's too quiet/short to measure. */
  integrated: number | null;
  /** The window actually used (shorter than the standard 0.4 s for very short passages). */
  windowSec: number;
}

/**
 * Momentary loudness (LUFS) of a passage, mono. Windows are 400 ms with 75% overlap as in BS.1770; a
 * passage shorter than that is measured with a shorter window and says so. Also the gated integrated value.
 */
export function loudness(samples: Float32Array, sr: number, startSec: number, endSec: number, opts: { windowSec?: number } = {}): Loudness {
  const [i0, i1] = clampRange(samples, sr, startSec, endSec);
  const span = (i1 - i0) / sr;
  let windowSec = opts.windowSec ?? 0.4;
  if (span < windowSec) windowSec = Math.max(0.1, span);
  // run the filters from a little before the passage, so their start-up transient isn't measured
  const pre = Math.min(i0, Math.round(0.5 * sr));
  const seg = new Float64Array(i1 - i0 + pre);
  for (let i = 0; i < seg.length; i++) seg[i] = samples[i0 - pre + i];
  const { shelf, highpass } = kWeighting(sr);
  const w = biquad(biquad(seg, shelf), highpass);
  const sq = new Float64Array(w.length);
  for (let i = 0; i < w.length; i++) sq[i] = w[i] * w[i];
  const prefix = new Float64Array(sq.length + 1);
  for (let i = 0; i < sq.length; i++) prefix[i + 1] = prefix[i] + sq[i];

  const win = Math.max(1, Math.round(windowSec * sr));
  const hop = Math.max(1, Math.round(hopFor(span, windowSec / 4) * sr));
  const times: number[] = [];
  const values: (number | null)[] = [];
  const energies: number[] = [];
  for (let s = pre; s + win <= sq.length; s += hop) {
    const ms = (prefix[s + win] - prefix[s]) / win;
    energies.push(ms);
    times.push(startSec + (s - pre + win / 2) / sr);
    values.push(ms > 1e-12 ? -0.691 + 10 * Math.log10(ms) : null);
  }
  // gated integrated loudness: drop blocks under -70 LUFS, then those more than 10 LU under what's left
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const abs = energies.filter((e) => e > 1e-12 && lufs(e) > -70);
  let integrated: number | null = null;
  if (abs.length > 0) {
    const gate = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const rel = abs.filter((e) => lufs(e) > gate);
    if (rel.length > 0) integrated = lufs(rel.reduce((a, b) => a + b, 0) / rel.length);
  }
  return { times, values, integrated, windowSec };
}

// ---------------------------------------------------------------------- pitch (YIN)

export interface Pitch extends Measured {
  /** 1 - the YIN aperiodicity at the chosen lag: near 1 = a clean periodic signal. */
  clarity: number[];
  fMin: number;
  fMax: number;
}

/**
 * Fundamental frequency contour by the YIN algorithm (de Cheveigne & Kawahara, 2002). Frames that are silent
 * or not clearly periodic come back as null - an honest gap, not a guess. Works on a decimated copy of the
 * signal (pitch needs far less bandwidth than audio does), which keeps it cheap on weak devices.
 */
export function yinPitch(samples: Float32Array, sr: number, startSec: number, endSec: number, opts: { fMin?: number; fMax?: number; hopSec?: number; threshold?: number; silenceDb?: number } = {}): Pitch {
  const fMin = opts.fMin ?? 70;
  const fMax = opts.fMax ?? 800;
  const threshold = opts.threshold ?? 0.1; // the original paper's recommendation: stricter than 0.15, so a tone above the range can't pass as a sub-multiple pitch
  const silenceDb = opts.silenceDb ?? -50;
  const hopSec = hopFor(endSec - startSec, opts.hopSec ?? 0.01);

  const factor = Math.max(1, Math.floor(sr / (fMax * 8)));
  const srD = sr / factor;
  const tauMax = Math.floor(srD / fMin);
  const tauMin = Math.max(2, Math.floor(srD / fMax));
  const W = tauMax;
  const need = W + tauMax + 2;

  // decimate (box filter) the passage plus enough margin that edge frames are complete
  const marginSamples = Math.ceil(need / srD * sr);
  const from = Math.max(0, Math.floor(startSec * sr) - marginSamples);
  const to = Math.min(samples.length, Math.ceil(endSec * sr) + marginSamples);
  const n = Math.floor((to - from) / factor);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[from + i * factor + k];
    x[i] = sum / factor;
  }

  // A real pitch has energy AT its fundamental. A tone above the range is still exactly periodic at a lag of
  // several periods, which YIN can't tell from a low pitch - but that "pitch" has no energy at its own frequency.
  const checkN = 4096;
  const checkWin = hann(checkN);
  const checkRe = new Float64Array(checkN);
  const checkIm = new Float64Array(checkN);
  const hasFundamental = (t: number, f0: number): boolean => {
    const first = Math.round(t * sr - checkN / 2);
    for (let i = 0; i < checkN; i++) {
      const idx = first + i;
      checkRe[i] = (idx >= 0 && idx < samples.length ? samples[idx] : 0) * checkWin[i];
      checkIm[i] = 0;
    }
    fft(checkRe, checkIm);
    const binHz = sr / checkN;
    let peak = 0;
    let atF0 = 0;
    for (let k = Math.max(1, Math.floor(30 / binHz)); k < Math.min(checkN / 2, Math.floor(8000 / binHz)); k++) {
      const m = Math.hypot(checkRe[k], checkIm[k]);
      if (m > peak) peak = m;
      if (k * binHz >= f0 * 0.94 && k * binHz <= f0 * 1.06 && m > atF0) atF0 = m;
    }
    return peak > 0 && atF0 >= 0.03 * peak; // within 30 dB of the strongest component
  };

  const times: number[] = [];
  const values: (number | null)[] = [];
  const clarity: number[] = [];
  const d = new Float64Array(tauMax + 1);
  const cm = new Float64Array(tauMax + 1);
  for (let t = startSec; t <= endSec + 1e-9; t += hopSec) {
    times.push(t);
    const centre = Math.round(((t * sr - from) / sr) * srD);
    const p = centre - Math.floor(need / 2);
    if (p < 0 || p + need > n) {
      values.push(null);
      clarity.push(0);
      continue;
    }
    let energy = 0;
    for (let j = 0; j < W; j++) energy += x[p + j] * x[p + j];
    if (dbfs(energy / W) < silenceDb) {
      values.push(null);
      clarity.push(0);
      continue;
    }
    // difference function, then cumulative-mean-normalised
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = x[p + j] - x[p + j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    cm[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      cm[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }
    let tau = -1;
    for (let k = tauMin; k < tauMax; k++) {
      if (cm[k] < threshold) {
        while (k + 1 < tauMax && cm[k + 1] < cm[k]) k++; // walk down to the bottom of this dip
        tau = k;
        break;
      }
    }
    if (tau < 0) {
      let best = tauMin;
      for (let k = tauMin; k < tauMax; k++) if (cm[k] < cm[best]) best = k;
      values.push(null);
      clarity.push(Math.max(0, 1 - cm[best]));
      continue;
    }
    // parabolic interpolation around the minimum for sub-sample lag
    let refined = tau;
    if (tau > 1 && tau < tauMax) {
      const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
      const denom = a - 2 * b + c;
      if (denom !== 0) refined = tau + (a - c) / (2 * denom);
    }
    const f0 = srD / refined;
    values.push(f0 >= fMin && f0 <= fMax && hasFundamental(t, f0) ? f0 : null);
    clarity.push(1 - cm[tau]);
  }
  return { times, values, clarity, fMin, fMax };
}

// ------------------------------------------------------------ spectral centroid

/** The spectrum's "centre of mass" in Hz over time - a simple, widely used correlate of brightness. */
export function spectralCentroid(samples: Float32Array, sr: number, startSec: number, endSec: number, opts: { fftSize?: number; hopSec?: number; silenceDb?: number } = {}): Measured {
  const N = opts.fftSize ?? 2048;
  const silenceDb = opts.silenceDb ?? -60;
  const hopSec = hopFor(endSec - startSec, opts.hopSec ?? 0.01);
  const win = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const times: number[] = [];
  const values: (number | null)[] = [];
  for (let t = startSec; t <= endSec + 1e-9; t += hopSec) {
    times.push(t);
    const first = Math.round(t * sr - N / 2);
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const idx = first + i;
      const v = idx >= 0 && idx < samples.length ? samples[idx] : 0;
      energy += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    if (dbfs(energy / N) < silenceDb) {
      values.push(null);
      continue;
    }
    fft(re, im);
    let num = 0;
    let den = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      num += ((k * sr) / N) * m;
      den += m;
    }
    values.push(den > 0 ? num / den : null);
  }
  return { times, values };
}

// ----------------------------------------------------------------------- onsets

export interface Onsets {
  times: number[];
  /** Relative strength, 1 = the strongest onset found. */
  strength: number[];
}

/** Smallest flux (log-magnitude units per bin) that can count as new sound: about 5% of a loud tone starting. */
const MIN_FLUX = 0.002;

/**
 * Note/event onsets by spectral flux: how much new energy appears from one short frame to the next,
 * with an adaptive threshold and a minimum gap so one attack isn't reported twice.
 */
export function detectOnsets(samples: Float32Array, sr: number, startSec: number, endSec: number, opts: { fftSize?: number; hopSamples?: number; minGapSec?: number; silenceDb?: number } = {}): Onsets {
  const N = opts.fftSize ?? 1024;
  const hop = opts.hopSamples ?? 256;
  const minGap = opts.minGapSec ?? 0.06;
  const silenceDb = opts.silenceDb ?? -60;
  const win = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const kMax = Math.min(N / 2, Math.floor((10000 * N) / sr));
  const [i0, i1] = clampRange(samples, sr, startSec, endSec);
  const frames: number[] = [];
  const loud: boolean[] = [];
  const energies: number[] = [];
  let prev: Float64Array | null = null;
  const flux: number[] = [];
  // start one frame before the passage so an onset right at its start is still seen
  for (let c = i0 - hop; c <= i1; c += hop) {
    frames.push(c);
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const idx = c - N / 2 + i;
      const v = idx >= 0 && idx < samples.length ? samples[idx] : 0;
      energy += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    loud.push(dbfs(energy / N) >= silenceDb);
    energies.push(energy);
    fft(re, im);
    const logmag = new Float64Array(kMax);
    // Compression with its knee near -54 dBFS: below that, bins count linearly (so leakage ripple is negligible),
    // above it they're log-compressed (so a soft onset isn't drowned out by a loud one).
    for (let k = 0; k < kMax; k++) logmag[k] = Math.log1p(Math.sqrt(re[k] * re[k] + im[k] * im[k]) / 0.5);
    let f = 0;
    if (prev) for (let k = 0; k < kMax; k++) f += Math.max(0, logmag[k] - prev[k]);
    flux.push(f / kMax);
    prev = logmag;
  }
  const maxFlux = Math.max(...flux, 1e-9);
  const radius = Math.max(2, Math.round(0.1 * sr / hop));
  const picks: { idx: number; v: number }[] = [];
  for (let t = 1; t < flux.length - 1; t++) {
    if (!loud[t] && !loud[t + 1]) continue;
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, t - radius); k <= Math.min(flux.length - 1, t + radius); k++) {
      sum += flux[k];
      cnt++;
    }
    const local = sum / cnt;
    const isPeak = flux[t] >= flux[t - 1] && flux[t] > flux[t + 1];
    // An onset is where new sound ARRIVES: the frame energy after the event must exceed what came before it. This
    // keeps the spectral change at the start of a note's fade-out (energy falling) from being reported as an attack.
    const arriving = energies[t + 1] > energies[t - 1];
    // The floor is absolute as well as relative: a steady tone's frame-to-frame ripple isn't an onset, and
    // with nothing loud in the passage a purely relative threshold would promote that ripple.
    if (isPeak && arriving && flux[t] > local + Math.max(0.1 * maxFlux, MIN_FLUX)) picks.push({ idx: t, v: flux[t] });
  }
  // keep the strongest in any minGap window
  picks.sort((a, b) => b.v - a.v);
  const kept: { idx: number; v: number }[] = [];
  for (const p of picks) if (kept.every((q) => Math.abs(frames[q.idx] - frames[p.idx]) / sr >= minGap)) kept.push(p);
  kept.sort((a, b) => a.idx - b.idx);
  const strongest = Math.max(...kept.map((k) => k.v), 1e-9);
  const inRange = kept.filter((k) => frames[k.idx] / sr >= startSec - 1e-9 && frames[k.idx] / sr <= endSec + 1e-9);
  return { times: inRange.map((k) => frames[k.idx] / sr), strength: inRange.map((k) => k.v / strongest) };
}
