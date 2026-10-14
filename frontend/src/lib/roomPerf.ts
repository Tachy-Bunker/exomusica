// Keeps the room smooth on whatever it runs on: when painting is slow the picture is drawn with fewer pixels (and past a point at 30 frames a second); when there is plenty of room it comes back. Pure.
export const STEPS = [1, 0.85, 0.7, 0.55, 0.42] as const;
/** From this step on, painting is limited to ~30 per second. */
export const CAP_FROM = 3;
export const SLOW_MS = 11, FAST_MS = 4, DOWN_AFTER = 18, UP_AFTER = 150, HOLD_MS = 2500;

export class ScaleGovernor {
  step = 0;
  private slow = 0; private fast = 0; private since = -1e9;
  private ring = new Float32Array(120); private n = 0; private i = 0; private sum = 0;
  /** Feed the time one paint took. Returns the new step when it changed, otherwise null. */
  observe(paintMs: number, now: number): number | null {
    this.sum += paintMs - this.ring[this.i]; this.ring[this.i] = paintMs; this.i = (this.i + 1) % this.ring.length; if (this.n < this.ring.length) this.n++;
    // a running balance, so one hiccup in a good run (or one lucky frame in a bad one) does not decide anything
    if (paintMs > SLOW_MS) { this.slow++; this.fast = Math.max(0, this.fast - 3); } else if (paintMs < FAST_MS) { this.fast++; this.slow = Math.max(0, this.slow - 1); } else { this.slow = Math.max(0, this.slow - 1); this.fast = Math.max(0, this.fast - 1); }
    if (now - this.since < HOLD_MS) return null;
    if (this.slow >= DOWN_AFTER && this.step < STEPS.length - 1) { this.step++; return this.moved(now); }
    if (this.fast >= UP_AFTER && this.step > 0) { this.step--; return this.moved(now); }
    return null;
  }
  private moved(now: number): number { this.since = now; this.slow = 0; this.fast = 0; this.ring.fill(0); this.n = 0; this.sum = 0; this.i = 0; return this.step; }
  get scale(): number { return STEPS[this.step]; }
  /** Smallest gap between paints, in ms (0 = every frame). */
  get minGap(): number { return this.step >= CAP_FROM ? 30 : 0; }
  get averageMs(): number { return this.n ? this.sum / this.n : 0; }
  /** 95th percentile of recent paints. */
  p95(): number { if (!this.n) return 0; const a = Array.from(this.ring.subarray(0, this.n)).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]; }
}
