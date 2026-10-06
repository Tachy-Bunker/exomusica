import { kWeighting } from "../analysis";

/**
 * Integrated (gated) loudness measured on a stream of mono samples, in any chunk sizes, with memory that grows by only a
 * few numbers per tenth of a second. This is the ITU-R BS.1770 method: K-weighting, 400 ms blocks every 100 ms, then the
 * -70 LUFS and relative -10 LU gates. For one channel; add 3.01 dB for a mono signal heard on two speakers.
 */
export class LoudnessMeter {
  private readonly hopN: number;
  private readonly b1: number[];
  private readonly a1: number[];
  private readonly b2: number[];
  private readonly a2: number[];
  private x1a = 0;
  private x2a = 0;
  private y1a = 0;
  private y2a = 0;
  private x1b = 0;
  private x2b = 0;
  private y1b = 0;
  private y2b = 0;
  private acc = 0;
  private inHop = 0;
  private readonly hops: number[] = [];

  constructor(sampleRate: number) {
    this.hopN = Math.max(1, Math.round(0.1 * sampleRate));
    const { shelf, highpass } = kWeighting(sampleRate);
    this.b1 = shelf.b;
    this.a1 = shelf.a;
    this.b2 = highpass.b;
    this.a2 = highpass.a;
  }

  push(samples: Float32Array): void {
    const { b1, a1, b2, a2 } = this;
    let { x1a, x2a, y1a, y2a, x1b, x2b, y1b, y2b, acc, inHop } = this;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const v = b1[0] * x + b1[1] * x1a + b1[2] * x2a - a1[1] * y1a - a1[2] * y2a;
      x2a = x1a;
      x1a = x;
      y2a = y1a;
      y1a = v;
      const w = b2[0] * v + b2[1] * x1b + b2[2] * x2b - a2[1] * y1b - a2[2] * y2b;
      x2b = x1b;
      x1b = v;
      y2b = y1b;
      y1b = w;
      acc += w * w;
      if (++inHop === this.hopN) {
        this.hops.push(acc);
        acc = 0;
        inHop = 0;
      }
    }
    this.x1a = x1a; this.x2a = x2a; this.y1a = y1a; this.y2a = y2a;
    this.x1b = x1b; this.x2b = x2b; this.y1b = y1b; this.y2b = y2b;
    this.acc = acc;
    this.inHop = inHop;
  }

  /** Integrated loudness so far in LUFS (one channel), or null if nothing is loud enough to measure. */
  integrated(): number | null {
    const h = this.hops;
    const energies: number[] = [];
    for (let k = 0; k + 4 <= h.length; k++) energies.push((h[k] + h[k + 1] + h[k + 2] + h[k + 3]) / (4 * this.hopN));
    const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
    const abs = energies.filter((e) => e > 1e-12 && lufs(e) > -70);
    if (abs.length === 0) return null;
    const gate = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const rel = abs.filter((e) => lufs(e) > gate);
    return rel.length > 0 ? lufs(rel.reduce((a, b) => a + b, 0) / rel.length) : null;
  }
}
