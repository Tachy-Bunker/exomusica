// A short-lookahead peak limiter that works on a stream of samples in any chunk sizes, with the same output as
// processing the whole signal at once. Memory use does not grow with the length of the audio.

/**
 * Keeps every sample at or below `ceiling`. Where nothing exceeds the ceiling the audio comes out exactly as it went in.
 * The gain starts easing down a few milliseconds BEFORE a peak arrives and recovers slowly afterwards (about 50 ms), which
 * avoids the distortion a fast limiter adds to low voices. Output is delayed by a few milliseconds of lookahead: push()
 * returns what is ready, finish() returns the rest, and the total length out equals the total length in.
 */
export class StreamLimiter {
  private readonly look: number;
  private readonly half: number;
  private readonly rel: number;
  private readonly ceiling: number;
  // input samples still waiting for their output (ring buffer)
  private readonly xr: Float32Array;
  private readonly xMask: number;
  // sliding minimum of "how much each sample needs to be turned down" over +-look samples: a monotonic deque
  private readonly dqIdx: Float64Array;
  private readonly dqVal: Float64Array;
  private readonly dqCap: number;
  private dqHead = 0;
  private dqTail = 0;
  // the minima (ring buffer) that the smoothing average reads
  private readonly mr: Float32Array;
  private readonly mCap: number;

  private n = 0; // samples received
  private added = 0; // next sample to put in the deque
  private mCount = 0; // minima computed
  private gNext = 0; // next output sample
  private sum = 0;
  private count = 0;
  private inited = false;
  private prev = 1;
  private minG = 1;
  private finished = false;

  static readonly MAX_SLICE = 8192;

  constructor(sampleRate: number, ceiling: number) {
    this.ceiling = ceiling;
    this.look = Math.max(1, Math.round(0.004 * sampleRate)); // lookahead / attack, ~4 ms
    this.half = Math.max(1, this.look >> 1);
    this.rel = 1 - Math.exp(-1 / (0.05 * sampleRate));
    let cap = 1;
    while (cap < StreamLimiter.MAX_SLICE + 2 * this.look + 2 * this.half + 16) cap <<= 1;
    this.xr = new Float32Array(cap);
    this.xMask = cap - 1;
    this.dqCap = 2 * this.look + 4;
    this.dqIdx = new Float64Array(this.dqCap);
    this.dqVal = new Float64Array(this.dqCap);
    // The minima are computed ahead of the output by up to one whole slice, and by `look` more when the stream ends, so the ring must hold that
    // plus the averaging window: anything smaller silently overwrites values that are still needed.
    let mCap = 1;
    while (mCap < StreamLimiter.MAX_SLICE + this.look + 2 * this.half + 16) mCap <<= 1;
    this.mCap = mCap;
    this.mr = new Float32Array(mCap);
  }

  private need(i: number): number {
    const a = Math.abs(this.xr[i & this.xMask]);
    return a > this.ceiling ? this.ceiling / a : 1;
  }

  /** Feeds samples in; returns the output that is ready now (possibly empty). */
  push(chunk: Float32Array): Float32Array {
    const out: Float32Array[] = [];
    for (let p = 0; p < chunk.length; p += StreamLimiter.MAX_SLICE) {
      const slice = chunk.subarray(p, Math.min(chunk.length, p + StreamLimiter.MAX_SLICE));
      for (let k = 0; k < slice.length; k++) this.xr[(this.n + k) & this.xMask] = slice[k];
      this.n += slice.length;
      out.push(this.advance());
    }
    return join(out);
  }

  /** Ends the stream; returns the remaining output. */
  finish(): Float32Array {
    this.finished = true;
    return this.advance();
  }

  /** The largest reduction used so far, in dB. */
  maxReductionDb(): number {
    return -20 * Math.log10(this.minG);
  }

  private advance(): Float32Array {
    const { look, half, dqCap, dqIdx, dqVal, mr, mCap } = this;
    // 1) the minimum need within +-look samples of each sample
    while (this.mCount < this.n && (this.finished || this.mCount + look < this.n)) {
      const hi = Math.min(this.n - 1, this.mCount + look);
      while (this.added <= hi) {
        const v = this.need(this.added);
        while (this.dqTail > this.dqHead && dqVal[(this.dqTail - 1) % dqCap] >= v) this.dqTail--;
        dqIdx[this.dqTail % dqCap] = this.added;
        dqVal[this.dqTail % dqCap] = v;
        this.dqTail++;
        this.added++;
      }
      while (dqIdx[this.dqHead % dqCap] < this.mCount - look) this.dqHead++;
      mr[this.mCount % mCap] = dqVal[this.dqHead % dqCap];
      this.mCount++;
    }
    // 2) the smoothing average starts as the sum of the first minima
    if (!this.inited && (this.mCount > half || (this.finished && this.mCount === this.n))) {
      const upto = Math.min(this.n - 1, half);
      for (let j = 0; j <= upto; j++) {
        this.sum += mr[j % mCap];
        this.count++;
      }
      this.inited = true;
    }
    // 3) smoothed gain -> slow recovery -> apply
    const out = new Float32Array(Math.max(0, this.n - this.gNext));
    let produced = 0;
    while (this.inited && this.gNext < this.n) {
      const i = this.gNext;
      if (i > 0) {
        const add = i + half;
        if (add < this.mCount) {
          this.sum += mr[add % mCap];
          this.count++;
        } else if (!this.finished) break; // that minimum isn't known yet
        const drop = i - 1 - half;
        if (drop >= 0) {
          this.sum -= mr[drop % mCap];
          this.count--;
        }
      }
      const g = Math.fround(this.sum / this.count);
      const gi = Math.min(g, this.prev + (1 - this.prev) * this.rel);
      out[produced++] = this.xr[i & this.xMask] * gi;
      this.prev = gi;
      if (gi < this.minG) this.minG = gi;
      this.gNext++;
    }
    return out.subarray(0, produced);
  }
}

function join(parts: Float32Array[]): Float32Array {
  if (parts.length === 1) return parts[0];
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Limits a whole array in place (the same processing as StreamLimiter, for audio that is already in memory). Returns the largest reduction in dB. */
export function limitPeaks(x: Float32Array, sampleRate: number, ceiling: number): number {
  const lim = new StreamLimiter(sampleRate, ceiling);
  let o = 0;
  const take = (a: Float32Array) => {
    x.set(a, o);
    o += a.length;
  };
  take(lim.push(x.slice()));
  take(lim.finish());
  return lim.maxReductionDb();
}
