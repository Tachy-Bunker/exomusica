// Waveform + spectrogram maths for audio evidence. The DSP is pure (no DOM)
// so it can be tested against known signals; only decoding and drawing touch
// the browser. Authors run this once; readers only ever see the PNG it makes.

// ------------------------------------------------------------------ DSP

/** In-place radix-2 complex FFT. `re`/`im` lengths must be the same power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Min/max per bucket, interleaved [min0, max0, min1, max1, ...] - what a waveform is drawn from. */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets * 2);
  const per = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.min(samples.length, Math.floor((b + 1) * per)));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = from; i < to; i++) {
      const v = samples[i] ?? 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[b * 2] = Number.isFinite(lo) ? lo : 0;
    out[b * 2 + 1] = Number.isFinite(hi) ? hi : 0;
  }
  return out;
}

export interface Spectrogram {
  /** frames[t][k] = level in dB (<= 0, relative to the loudest cell or -60 dBFS, whichever is louder) of bin k at column t. */
  db: Float32Array[];
  bins: number;
  sampleRate: number;
  fftSize: number;
  startSec: number;
  endSec: number;
  /** fullFrame[t] is false for columns whose window hangs off the start/end of the audio (their edge is artificial). */
  fullFrame: boolean[];
}

/**
 * Short-time spectrum of samples[startSec..endSec]: `columns` evenly spaced
 * Hann-windowed frames, in dB relative to the loudest cell, floored at -rangeDb.
 */
export function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  opts: { fftSize?: number; columns?: number; rangeDb?: number } = {},
): Spectrogram {
  const fftSize = opts.fftSize ?? 1024;
  const columns = Math.max(1, opts.columns ?? 584);
  const rangeDb = opts.rangeDb ?? 80;
  // The region sets where the frames are centred. The audio itself is read from the whole recording, so
  // a cut in the middle of a sound doesn't invent a hard edge; only the true file ends are zero-padded.
  const from = Math.max(0, startSec * sampleRate);
  const to = Math.min(samples.length, endSec * sampleRate);
  const span = Math.max(0, to - from);
  const window = hann(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const bins = fftSize / 2;
  const frames: Float32Array[] = [];
  const fullFrame: boolean[] = [];
  let peak = -Infinity;
  const scale = 2 / window.reduce((a, b) => a + b, 0); // makes a full-scale sine read 0 dB

  for (let c = 0; c < columns; c++) {
    // frame centre sweeps the region; frames near the edges are zero-padded
    const centre = from + (columns === 1 ? span / 2 : (c / (columns - 1)) * span);
    const first = Math.round(centre - fftSize / 2);
    fullFrame.push(first >= 0 && first + fftSize <= samples.length);
    for (let i = 0; i < fftSize; i++) {
      const idx = first + i;
      re[i] = idx >= 0 && idx < samples.length ? samples[idx] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    const col = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
      const db = 20 * Math.log10(mag + 1e-12);
      col[k] = db;
      if (db > peak) peak = db;
    }
    frames.push(col);
  }
  // Level is relative to the loudest cell, but never boosted past -60 dBFS: otherwise a silent region
  // would normalise against itself and render as a bright picture of nothing.
  const reference = Math.max(peak, -60);
  for (const col of frames) for (let k = 0; k < bins; k++) col[k] = Math.max(-rangeDb, col[k] - reference);
  return { db: frames, bins, sampleRate, fftSize, startSec, endSec, fullFrame };
}

/** Piecewise-linear "magma-like" colour map: 0 (quiet, near black) .. 1 (loud, pale yellow). */
const STOPS: [number, number, number][] = [
  [2, 2, 12],
  [40, 17, 89],
  [110, 31, 129],
  [183, 55, 121],
  [243, 118, 90],
  [253, 197, 120],
  [252, 253, 191],
];
export function colormap(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

const MAX_HZ_STEPS = [1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 16000];

/**
 * A sensible top frequency for the picture: just above the highest strong content, so a
 * formant study isn't squashed into the bottom 5% of a 0-16 kHz axis. "Strong" means within
 * 45 dB of the loudest cell, which ignores the faint broadband clicks at note onsets.
 */
export function suggestMaxHz(sp: Spectrogram): number {
  const nyquist = sp.sampleRate / 2;
  const hzPerBin = nyquist / sp.bins;
  // columns hanging off the file's ends contain the hard cut of the signal, which splatters across every frequency
  const usable = sp.db.filter((_, t) => sp.fullFrame[t]);
  const cols = usable.length > 0 ? usable : sp.db;
  // a bin only counts if it's strong for a few frames running-ish: a single click shouldn't stretch the axis
  const minFrames = Math.max(3, Math.ceil(cols.length * 0.015));
  let top = 0;
  for (let k = sp.bins - 1; k >= 0 && top === 0; k--) {
    let strong = 0;
    for (const col of cols) if (col[k] > -45 && ++strong >= minFrames) break;
    if (strong >= minFrames) top = (k + 1) * hzPerBin;
  }
  const wanted = Math.max(top, 1) * 1.2;
  const limit = Math.min(nyquist, 16000);
  return Math.min(limit, MAX_HZ_STEPS.find((s) => s >= wanted) ?? limit);
}

export interface SpectrogramPixels {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Highest frequency shown (Hz): rows run from 0 Hz at the bottom to this at the top. */
  maxHz: number;
}

/**
 * Rasterises the spectrogram: one pixel column per frame, frequency on a
 * linear vertical axis from 0 to maxHz. When several bins land on one row
 * the loudest wins, so narrow peaks never vanish.
 */
export function spectrogramPixels(sp: Spectrogram, height: number, maxHzWanted = 16000, rangeDb = 80): SpectrogramPixels {
  const nyquist = sp.sampleRate / 2;
  const maxHz = Math.min(nyquist, maxHzWanted);
  const width = sp.db.length;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const hzPerBin = nyquist / sp.bins;
  for (let y = 0; y < height; y++) {
    const hiHz = maxHz * (1 - y / height);
    const loHz = maxHz * (1 - (y + 1) / height);
    const kLo = loHz / hzPerBin;
    const kHi = hiHz / hzPerBin;
    const k0 = Math.max(0, Math.min(sp.bins - 1, Math.floor(kLo)));
    const k1 = Math.max(k0, Math.min(sp.bins - 1, Math.floor(kHi)));
    // Rows narrower than a bin (zoomed in) interpolate between neighbouring bins, so peaks are smooth and
    // sit where they really are; rows spanning several bins (zoomed out) take the loudest, so peaks never vanish.
    const interpolate = kHi - kLo < 1;
    const kc = (kLo + kHi) / 2;
    const ka = Math.max(0, Math.min(sp.bins - 1, Math.floor(kc)));
    const kb = Math.min(sp.bins - 1, ka + 1);
    const frac = Math.min(1, Math.max(0, kc - ka));
    for (let x = 0; x < width; x++) {
      let level = -Infinity;
      if (interpolate) level = sp.db[x][ka] * (1 - frac) + sp.db[x][kb] * frac;
      else for (let k = k0; k <= k1; k++) if (sp.db[x][k] > level) level = sp.db[x][k];
      const [r, g, b] = colormap((level + rangeDb) / rangeDb);
      const o = (y * width + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return { rgba, width, height, maxHz };
}

// -------------------------------------------------------------- browser side

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

// Decoded PCM is big (a few minutes of mono 44.1 kHz is tens of MB), so only the most recent file is kept.
let lastDecoded: { url: string; audio: DecodedAudio } | null = null;
const inflight = new Map<string, Promise<DecodedAudio>>();

/** Fetches and decodes to mono. Rejects if the file can't be fetched (e.g. a host without CORS). */
export function decodeToMono(url: string): Promise<DecodedAudio> {
  if (lastDecoded?.url === url) return Promise.resolve(lastDecoded.audio);
  const existing = inflight.get(url);
  if (existing) return existing;
  const job = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    // Very large files are decoded at a lower rate to keep memory sane on weaker devices.
    const rate = bytes.byteLength > 30 * 1024 * 1024 ? 16000 : 44100;
    const ctx = new OfflineAudioContext(1, 1, rate);
    const buf = await ctx.decodeAudioData(bytes);
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buf.numberOfChannels;
    }
    const audio = { samples: mono, sampleRate: buf.sampleRate, duration: buf.duration };
    lastDecoded = { url, audio };
    return audio;
  })();
  inflight.set(url, job);
  job.then(
    () => inflight.delete(url),
    () => inflight.delete(url),
  );
  return job;
}

const PLOT = { left: 54, right: 10, top: 10, bottom: 30 };
export const SPECTROGRAM_SIZE = { width: 640, height: 320 };

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

/**
 * Draws a self-contained spectrogram image (with labelled axes - evidence
 * should stand on its own) for a slice of already-decoded audio.
 */
export function renderSpectrogramCanvas(audio: DecodedAudio, startSec: number, endSec: number, maxHz: number | "auto" = "auto"): HTMLCanvasElement {
  const { width: W, height: H } = SPECTROGRAM_SIZE;
  const plotW = W - PLOT.left - PLOT.right;
  const plotH = H - PLOT.top - PLOT.bottom;
  const sp = computeSpectrogram(audio.samples, audio.sampleRate, startSec, endSec, { columns: plotW });
  const px = spectrogramPixels(sp, plotH, maxHz === "auto" ? suggestMaxHz(sp) : maxHz);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#05050c";
  g.fillRect(0, 0, W, H);
  g.putImageData(new ImageData(px.rgba as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), PLOT.left, PLOT.top);

  g.fillStyle = "#c8cbe0";
  g.strokeStyle = "#8a8fb0";
  g.font = "11px sans-serif";
  g.textBaseline = "middle";
  g.textAlign = "right";
  const hzStep = niceStep(px.maxHz, 6);
  for (let hz = 0; hz <= px.maxHz + 1e-6; hz += hzStep) {
    const y = PLOT.top + plotH * (1 - hz / px.maxHz);
    g.beginPath();
    g.moveTo(PLOT.left - 4, y);
    g.lineTo(PLOT.left, y);
    g.stroke();
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), PLOT.left - 7, Math.min(H - PLOT.bottom - 4, Math.max(PLOT.top + 4, y)));
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  const span = endSec - startSec;
  const tStep = niceStep(span, 6);
  for (let t = Math.ceil(startSec / tStep) * tStep; t <= endSec + 1e-9; t += tStep) {
    const x = PLOT.left + ((t - startSec) / span) * plotW;
    g.beginPath();
    g.moveTo(x, PLOT.top + plotH);
    g.lineTo(x, PLOT.top + plotH + 4);
    g.stroke();
    g.fillText(`${Number(t.toFixed(2))}s`, x, PLOT.top + plotH + 7);
  }
  g.strokeRect(PLOT.left - 0.5, PLOT.top - 0.5, plotW + 1, plotH + 1);
  g.save();
  g.translate(11, PLOT.top + plotH / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Hz", 0, 0);
  g.restore();
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't encode image"))), "image/png"));
}
