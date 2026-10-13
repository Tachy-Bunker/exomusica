import { encodeWav } from "./studioDsp";
import { freqOf, LANES, stepMs, stepsBetween, STEPS, type JamState } from "./jamTheory";

const LOOKAHEAD_MS = 140;
const LEVEL = [0.9, 0.22, 0.38, 0.2];

function noise(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate), d = b.getChannelData(0);
  let x = 22222; for (let i = 0; i < d.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; d[i] = (x / 2147483648) - 1; } // deterministic noise: a saved loop sounds the same every time
  return b;
}

/** One note of one lane at audio time t. Used live and for the offline render, so what you save is what you heard. */
export function voice(ctx: BaseAudioContext, out: AudioNode, lane: number, v: number, state: JamState, t: number, hat: AudioBuffer): void {
  const g = ctx.createGain(); g.connect(out);
  const done = (n: AudioScheduledSourceNode) => { n.onended = () => { n.disconnect(); g.disconnect(); }; };
  if (lane === 0) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(LEVEL[0], t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.32); done(o);
  } else if (lane === 1) {
    const s = ctx.createBufferSource(); s.buffer = hat; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    g.gain.setValueAtTime(LEVEL[1], t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    s.connect(hp); hp.connect(g); s.start(t); s.stop(t + 0.08); done(s);
  } else {
    const f = freqOf(state.scale, state.root, v, lane), dur = stepMs(state.tempo) / 1000 * (lane === 2 ? 1.8 : 1.3);
    const o = ctx.createOscillator(); o.type = lane === 2 ? "sawtooth" : "triangle"; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(lane === 2 ? 900 : 3500, t); lp.frequency.exponentialRampToValueAtTime(lane === 2 ? 220 : 900, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(LEVEL[lane], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.02); done(o);
  }
}

export class JamEngine {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private hat: AudioBuffer | null = null;
  private timer: number | null = null;
  private lastEnd = 0;
  private lastKey = "";
  constructor(private getState: () => JamState | null, private serverNow: () => number, private onStep: (n: number, delayMs: number) => void) {}

  get running(): boolean { return this.timer !== null; }

  start(): void {
    if (this.timer !== null) return;
    this.ctx ??= new AudioContext({ latencyHint: "interactive" });
    if (!this.out) {
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      const master = this.ctx.createGain(); master.gain.value = 0.8; comp.connect(master); master.connect(this.ctx.destination);
      this.out = comp; this.hat = noise(this.ctx);
    }
    void this.ctx.resume();
    this.lastEnd = this.serverNow();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
  }

  dispose(): void { this.stop(); void this.ctx?.close(); this.ctx = null; this.out = null; }

  private tick(): void {
    const s = this.getState(), ctx = this.ctx;
    if (!s || !ctx || !this.out || !this.hat) return;
    const now = this.serverNow(), to = now + LOOKAHEAD_MS;
    const key = `${s.epoch}|${s.tempo}|${s.swing}`;
    if (key !== this.lastKey) { this.lastKey = key; this.lastEnd = now; } // tempo or swing changed: count again from the new moment
    for (const { n, atMs } of stepsBetween(this.lastEnd, to, s.epoch, s.tempo, s.swing)) {
      const t = ctx.currentTime + Math.max(0, atMs - now) / 1000, col = n % STEPS;
      for (let lane = 0; lane < LANES; lane++) {
        const v = s.steps[lane][col];
        if (v > 0 && !s.muted[lane]) voice(ctx, this.out, lane, v, s, t, this.hat);
      }
      this.onStep(col, Math.max(0, atMs - now));
    }
    this.lastEnd = to;
  }
}

/** The pattern played `loops` times into a WAV (44.1 kHz, 16-bit, stereo). Rendered faster than real time and not at all on the live path. */
export async function renderLoop(s: JamState, loops = 2): Promise<Uint8Array> {
  const sr = 44100, d = stepMs(s.tempo) / 1000, len = Math.ceil((loops * STEPS * d + 0.6) * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  const master = ctx.createGain(); master.gain.value = 0.8; comp.connect(master); master.connect(ctx.destination);
  const hat = noise(ctx);
  for (let n = 0; n < loops * STEPS; n++) {
    const t = n * d + (n % 2 === 1 ? s.swing * d : 0), col = n % STEPS;
    for (let lane = 0; lane < LANES; lane++) { const v = s.steps[lane][col]; if (v > 0 && !s.muted[lane]) voice(ctx, comp, lane, v, s, t, hat); }
  }
  const buf = await ctx.startRendering();
  return encodeWav([buf.getChannelData(0), buf.getChannelData(1)], sr, 16);
}
