/** Signal studio DSP: text that shows up in a spectrogram, drawings that show up on an XY oscilloscope, a WAV writer, and a small spectrogram. Pure and dependency-free,
 *  so it runs in a worker and is tested without a browser. Everything is Float32 and loops over typed arrays: it is meant to stay quick on weak devices. */

// ---- a 5x7 pixel font ('#' lit)
const G: Record<string, string[]> = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"], B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"], D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"], F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "# ###", "#   #", "#   #", " ####"], H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: [" ### ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "], J: ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"], L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"], N: ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "], P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"], R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "], T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "], V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"], X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "], Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "], "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"], "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "], "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "], "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "], "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "], ",": ["     ", "     ", "     ", "     ", " ##  ", "  #  ", " #   "],
  "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "], "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "], ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "], "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "=": ["     ", "     ", "#####", "     ", "#####", "     ", "     "], "'": ["  #  ", "  #  ", " #   ", "     ", "     ", "     ", "     "],
  " ": ["   ", "   ", "   ", "   ", "   ", "   ", "   "],
};
export const FONT_CHARS = Object.keys(G).join("");
export const MAX_TEXT = 40;

/** The text as columns of 7 lit/unlit pixels, one blank column between glyphs. Unknown characters are skipped. */
export function textColumns(text: string): boolean[][] {
  const cols: boolean[][] = [];
  for (const ch of text.toUpperCase().slice(0, MAX_TEXT)) {
    const g = G[ch];
    if (!g) continue;
    for (let x = 0; x < g[0].length; x++) cols.push(g.map((row) => row[x] === "#"));
    cols.push(Array(7).fill(false));
  }
  return cols;
}

export interface TextOpts { text: string; sampleRate: number; seconds: number; fLow: number; fHigh: number; thickness: number }
/** Text that reads left to right in a spectrogram: each lit pixel of the font is a steady tone for the length of its column, top of the letter = highest pitch. */
export function synthSpectrogramText(o: TextOpts): Float32Array {
  const cols = textColumns(o.text);
  const sr = o.sampleRate, n = Math.max(1, Math.round(o.seconds * sr));
  const out = new Float32Array(n);
  if (cols.length === 0) return out;
  const pad = 2, total = cols.length + pad * 2, per = n / total;
  // tones per pixel row: closer than the spectrogram can resolve (~2 bins) reads as solid; `thickness` 1-4 trades solidity for speed
  const spacing = [200, 120, 70, 45][Math.max(1, Math.min(4, Math.round(o.thickness))) - 1];
  const th = Math.max(1, Math.min(16, Math.ceil((o.fHigh - o.fLow) / 7 / spacing)));
  const lines = 7 * th, step = (o.fHigh - o.fLow) / lines;
  const k = 1 - Math.exp(-1 / (sr * 0.002)); // 2 ms smoothing: no clicks, edges stay sharp
  for (let l = 0; l < lines; l++) {
    const row = Math.floor(l / th), inc = (2 * Math.PI * (o.fHigh - (l + 0.5) * step)) / sr;
    let env = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i / per) - pad;
      const target = c >= 0 && c < cols.length && cols[c][row] ? 1 : 0;
      env += (target - env) * k;
      ph += inc;
      if (env > 0.001) out[i] += env * Math.sin(ph);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  if (peak > 0) { const g = 0.9 / peak; for (let i = 0; i < n; i++) out[i] *= g; }
  return out;
}

export interface XYOpts { strokes: number[][]; sampleRate: number; seconds: number; rate: number }
const W = 1000, H = 700;
/** A drawing for an oscilloscope in XY mode: left = x, right = y. The pen travels the strokes in order and back to the start, `rate` times a second.
 *  The moves between strokes are drawn too (a scope has no pen-up), so the connections are part of the picture. */
export function synthXY(o: XYOpts): { l: Float32Array; r: Float32Array } {
  const pts: [number, number][] = [];
  for (const s of o.strokes) for (let i = 0; i + 1 < s.length; i += 2) pts.push([s[i], s[i + 1]]);
  const n = Math.max(1, Math.round(o.seconds * o.sampleRate));
  const l = new Float32Array(n), r = new Float32Array(n);
  if (pts.length === 0) return { l, r };
  if (pts.length === 1) pts.push([pts[0][0] + 1, pts[0][1]]);
  pts.push(pts[0]); // close the loop
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const L = cum[pts.length - 1] || 1;
  const frame = Math.max(8, Math.round(o.sampleRate / Math.max(1, o.rate)));
  const fl = new Float32Array(frame), fr = new Float32Array(frame);
  let seg = 1;
  for (let i = 0; i < frame; i++) {
    const s = (i / frame) * L;
    while (seg < pts.length - 1 && cum[seg] < s) seg++;
    const a = pts[seg - 1], b = pts[seg], len = cum[seg] - cum[seg - 1] || 1, t = Math.min(1, Math.max(0, (s - cum[seg - 1]) / len));
    fl[i] = ((a[0] + (b[0] - a[0]) * t) / W) * 1.8 - 0.9;
    fr[i] = -(((a[1] + (b[1] - a[1]) * t) / H) * 1.8 - 0.9); // screen y grows downward; the scope's grows upward
  }
  for (let i = 0; i < n; i++) { l[i] = fl[i % frame]; r[i] = fr[i % frame]; }
  return { l, r };
}

/** 16- or 24-bit PCM WAV, any channel count. */
export function encodeWav(channels: Float32Array[], sampleRate: number, bits: 16 | 24 = 16): Uint8Array {
  const nch = channels.length, n = channels[0]?.length ?? 0, bps = bits / 8;
  const data = n * nch * bps, buf = new ArrayBuffer(44 + data), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + data, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nch * bps, true); v.setUint16(32, nch * bps, true); v.setUint16(34, bits, true); w(36, "data"); v.setUint32(40, data, true);
  let o = 44;
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    const s = Math.round(Math.max(-1, Math.min(1, channels[c][i])) * max);
    if (bits === 16) { v.setInt16(o, s, true); o += 2; } else { v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
  }
  return new Uint8Array(buf);
}

/** Magnitude spectrogram, 0-255 per cell, frames x bins (bins = fft/2, lowest first). Hann window, in-place radix-2 FFT. */
export function spectrogram(x: Float32Array, fft = 1024, hop = 512, maxFrames = 1200): { frames: number; bins: number; data: Uint8Array } {
  const bins = fft / 2;
  const total = Math.max(0, Math.floor((x.length - fft) / hop) + 1);
  const stride = Math.max(1, Math.ceil(total / maxFrames)), frames = Math.ceil(total / stride);
  const data = new Uint8Array(frames * bins);
  const win = new Float32Array(fft), cos = new Float32Array(bins), sin = new Float32Array(bins);
  for (let i = 0; i < fft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fft - 1));
  for (let i = 0; i < bins; i++) { cos[i] = Math.cos((2 * Math.PI * i) / fft); sin[i] = -Math.sin((2 * Math.PI * i) / fft); }
  const re = new Float32Array(fft), im = new Float32Array(fft);
  const rev = new Uint32Array(fft);
  for (let i = 0, lg = Math.log2(fft); i < fft; i++) { let r = 0; for (let b = 0; b < lg; b++) r |= ((i >> b) & 1) << (lg - 1 - b); rev[i] = r; }
  for (let f = 0; f < frames; f++) {
    const off = f * stride * hop;
    for (let i = 0; i < fft; i++) { re[rev[i]] = (x[off + i] ?? 0) * win[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= fft; size <<= 1) {
      const half = size >> 1, tstep = fft / size;
      for (let s = 0; s < fft; s += size) for (let k = 0, t = 0; k < half; k++, t += tstep) {
        const a = s + k, b = a + half, tr = re[b] * cos[t] - im[b] * sin[t], ti = re[b] * sin[t] + im[b] * cos[t];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    for (let k = 0; k < bins; k++) {
      const db = 20 * Math.log10((Math.hypot(re[k], im[k]) / (fft / 4)) + 1e-9); // 0 dB = a full-scale sine
      data[f * bins + k] = Math.max(0, Math.min(255, Math.round(((db + 80) / 80) * 255)));
    }
  }
  return { frames, bins, data };
}

/** The site's accent gradient (forum orange to audio blue) as a 256-entry RGB table, dark at the bottom. */
export function gradientTable(): Uint8Array {
  const stops: [number, number[]][] = [[0, [7, 7, 10]], [0.3, [122, 58, 34]], [0.55, [226, 112, 63]], [0.8, [79, 168, 224]], [1, [242, 248, 255]]];
  const t = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let j = 1; while (j < stops.length - 1 && stops[j][0] < p) j++;
    const [p0, c0] = stops[j - 1], [p1, c1] = stops[j], u = (p - p0) / (p1 - p0);
    for (let c = 0; c < 3; c++) t[i * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * Math.max(0, Math.min(1, u)));
  }
  return t;
}
