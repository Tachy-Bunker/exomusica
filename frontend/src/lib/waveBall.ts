// Morph ball maths: a track's profile (loudness and brightness per slice), the terrain it makes, and the save points on it. Pure (no DOM).
import { fft, hann } from "./audioAnalysis";

export const WAVE_BINS = 720; // keep equal to backend/src/lib/waveProfile.ts
export interface Profile { amp: Uint8Array; cen: Uint8Array }

const CEN_LO = 100, CEN_HI = 10000, FRAME = 1024;
/** Loudness and brightness (spectral centroid) per slice. Amplitude is scaled so the 98th-percentile slice reaches 255 (hills use the whole height); brightness is log-scaled 100 Hz .. 10 kHz. */
export function computeProfile(samples: Float32Array, sr: number, bins = WAVE_BINS): Profile {
  const rms = new Float64Array(bins), cenHz = new Float64Array(bins), per = samples.length / bins;
  const win = hann(FRAME), re = new Float64Array(FRAME), im = new Float64Array(FRAME), nyq = FRAME / 2;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * per), to = Math.max(from + 1, Math.min(samples.length, Math.floor((b + 1) * per)));
    let e = 0; for (let i = from; i < to; i++) { const v = samples[i] ?? 0; e += v * v; }
    rms[b] = Math.sqrt(e / (to - from));
    if (rms[b] < 1e-5 || to - from < 8) continue;
    let num = 0, den = 0; const frames = to - from >= FRAME * 2 ? 2 : 1; // one or two windows per slice are plenty for a colour
    for (let f = 0; f < frames; f++) {
      const s = Math.max(0, Math.min(samples.length - FRAME, from + Math.floor(((f + 0.5) / frames) * (to - from)) - FRAME / 2));
      for (let i = 0; i < FRAME; i++) { re[i] = (samples[s + i] ?? 0) * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 2; k < nyq; k++) { const m = Math.hypot(re[k], im[k]); num += m * k * (sr / FRAME); den += m; }
    }
    cenHz[b] = den > 0 ? num / den : 0;
  }
  const sorted = Float64Array.from(rms).sort(), ref = Math.max(1e-4, sorted[Math.min(bins - 1, Math.floor(bins * 0.98))]);
  const amp = new Uint8Array(bins), cen = new Uint8Array(bins), span = Math.log2(CEN_HI / CEN_LO);
  for (let b = 0; b < bins; b++) {
    amp[b] = Math.round(255 * Math.min(1, Math.sqrt(rms[b] / ref)));
    cen[b] = cenHz[b] > 0 ? Math.round(255 * Math.max(0, Math.min(1, Math.log2(cenHz[b] / CEN_LO) / span))) : 0;
  }
  return { amp, cen };
}

export function encodeProfile(p: Profile): string {
  const bytes = new Uint8Array(p.amp.length + p.cen.length); bytes.set(p.amp, 0); bytes.set(p.cen, p.amp.length);
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function decodeProfile(b64: string): Profile | null {
  try {
    const s = atob(b64); if (s.length !== WAVE_BINS * 2) return null;
    const amp = new Uint8Array(WAVE_BINS), cen = new Uint8Array(WAVE_BINS);
    for (let i = 0; i < WAVE_BINS; i++) { amp[i] = s.charCodeAt(i); cen[i] = s.charCodeAt(WAVE_BINS + i); }
    return { amp, cen };
  } catch { return null; }
}

/** Height 0..1 of the terrain at time t (linear between slice centres). */
export function heightAt(p: Profile, t: number, dur: number): number {
  const n = p.amp.length, x = Math.max(0, Math.min(n - 1, (t / dur) * n - 0.5)), i = Math.floor(x), f = x - i, j = Math.min(n - 1, i + 1);
  return (p.amp[i] * (1 - f) + p.amp[j] * f) / 255;
}
/** Brightness 0..1 at time t. */
export function brightAt(p: Profile, t: number, dur: number): number {
  const n = p.cen.length, x = Math.max(0, Math.min(n - 1, (t / dur) * n - 0.5)), i = Math.floor(x), f = x - i, j = Math.min(n - 1, i + 1);
  return (p.cen[i] * (1 - f) + p.cen[j] * f) / 255;
}
/** Dull is deep blue-violet, bright is hot gold: hue in degrees for a brightness 0..1. */
export const hueOf = (c: number): number => 262 - 222 * Math.max(0, Math.min(1, c));

export interface Mark { label: string; t: number }
export const marksOf = (b: { label: string; timestampSeconds: number }[], dur: number): Mark[] => b.filter((m) => m.timestampSeconds >= 0 && m.timestampSeconds <= dur).map((m) => ({ label: m.label, t: m.timestampSeconds })).sort((a, c) => a.t - c.t);
/** The next save point after t (with a little slack), or null. */
export const nextMark = (m: Mark[], t: number): Mark | null => m.find((x) => x.t > t + 0.4) ?? null;
/** The save point before t: if you are right on one, the one before that. */
export const prevMark = (m: Mark[], t: number): Mark | null => { for (let i = m.length - 1; i >= 0; i--) if (m[i].t < t - 0.8) return m[i]; return null; };
/** The save point passed between two moments (either direction), or null. */
export function markCrossed(m: Mark[], t0: number, t1: number): Mark | null {
  const lo = Math.min(t0, t1), hi = Math.max(t0, t1); if (hi - lo > 3) return null; // a jump is a jump, not a roll
  for (const x of m) if (x.t >= lo && x.t <= hi) return x;
  return null;
}

/** How fast the head moves while a direction is held: 0.6x, climbing to 6x over a second and a half. Negative runs backwards. */
export const scrubRate = (dir: -1 | 0 | 1, heldSec: number): number => dir === 0 ? 1 : dir * (0.6 + 5.4 * Math.min(1, heldSec / 1.5) ** 1.5);

/** The ball: rolls on the terrain at the playhead; its outline gets spikier the brighter the sound. n points around, radius multipliers into `out`. */
export function ballOutline(bright: number, spin: number, n: number, out: Float64Array): void {
  const spikes = 3 + Math.round(bright * 7), depth = 0.04 + bright * 0.34;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + spin; out[i] = 1 + depth * Math.max(-0.3, Math.cos(a * spikes) - (1 - bright) * 1.2) * (bright > 0.04 ? 1 : 0); }
}
