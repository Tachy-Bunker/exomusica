// IMPORTANT: this module exists purely for visual reactivity (RMS-driven
// animation). It must never be able to break actual audio playback - if
// anything here fails, visuals simply stay non-reactive; audio keeps
// playing normally regardless. Every operation that touches the shared
// AudioContext or the <audio> element's routing is wrapped so a failure
// can't propagate and silence playback.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bus: GainNode | null = null;
let dataArray: Uint8Array | null = null;
let boundEl: HTMLAudioElement | null = null;

// One chain per <audio> element (the player owns two, so that one track can fade into the next):
//   source -> rg (ReplayGain) -> fade (crossfade) -> bus -> analyser -> destination
interface Chain { rg: GainNode; fade: GainNode }
const chains = new WeakMap<HTMLAudioElement, Chain>();

export function initAnalyser(el: HTMLAudioElement): void {
  if (chains.has(el)) return; // createMediaElementSource throws if called twice on one element
  try {
    if (!ctx) ctx = new AudioContext();
    if (!bus) {
      bus = ctx.createGain();
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      // Critical: connect all the way through to the destination, or the element's audio output
      // gets rerouted into this graph and never reaches speakers.
      bus.connect(node);
      node.connect(ctx.destination);
      analyser = node;
      dataArray = new Uint8Array(node.fftSize);
    }
    const source = ctx.createMediaElementSource(el);
    const rg = ctx.createGain();
    rg.gain.value = 1; // neutral until a track's ReplayGain value is applied
    const fade = ctx.createGain();
    fade.gain.value = 1;
    source.connect(rg);
    rg.connect(fade);
    fade.connect(bus);
    chains.set(el, { rg, fade });
    if (!boundEl) boundEl = el;
  } catch (err) {
    // Any failure here just means no reactive visuals - never touch playback itself in this catch.
    console.error("Audio analyser setup failed (visuals only, playback unaffected):", err);
  }
}

/** The element whose play state decides whether the visuals react (the one currently audible). */
export function setActiveForAnalyser(el: HTMLAudioElement | null): void {
  boundEl = el;
}

/** Sets the ReplayGain adjustment for the track an element is playing, in dB (converted to a linear multiplier).
 *  Safe to call when the graph was never set up: playback is never affected, it just won't be normalised. */
export function setReplayGainDb(db: number | null, el?: HTMLAudioElement | null): void {
  const c = el ? chains.get(el) : boundEl ? chains.get(boundEl) : undefined;
  if (!c || !ctx) return;
  try {
    const linear = db === null ? 1 : Math.pow(10, db / 20);
    c.rg.gain.setTargetAtTime(linear, ctx.currentTime, 0.05); // short ramp avoids an audible click on track change
  } catch {
    // Never let a gain-setting failure affect playback.
  }
}

/** Ramps an element's crossfade gain to `to` over `seconds` (equal-power curve). Returns false if the graph isn't there
 *  (then the caller just does a plain cut). */
export function rampFade(el: HTMLAudioElement, to: 0 | 1, seconds: number): boolean {
  const c = chains.get(el);
  if (!c || !ctx) return false;
  try {
    const g = c.fade.gain;
    const now = ctx.currentTime;
    const n = 24;
    const curve = new Float32Array(n);
    const from = g.value;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = to === 1 ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
      curve[i] = to === 1 ? from + (1 - from) * w : from * w;
    }
    g.cancelScheduledValues(now);
    g.setValueCurveAtTime(curve, now, Math.max(0.02, seconds));
    return true;
  } catch {
    return false;
  }
}

/** Puts an element's crossfade gain straight to a value (used to reset after a fade or a cancelled one). */
export function setFade(el: HTMLAudioElement, value: number): void {
  const c = chains.get(el);
  if (!c || !ctx) return;
  try { c.fade.gain.cancelScheduledValues(ctx.currentTime); c.fade.gain.value = value; } catch { /* ignore */ }
}

/** This context is created suspended by default and browsers require an
 *  explicit resume tied to a user gesture - without this, the main
 *  player's audio (routed through this context once initAnalyser runs)
 *  goes completely silent with no error, since .play() on the element
 *  still succeeds even though the graph it feeds into isn't running.
 *  Called from audioStore.play() itself, synchronously, so the resume
 *  request happens in the exact same gesture as the click that triggered
 *  playback - the safest possible timing for browser autoplay policy. */
export function resumeAnalyserContextIfNeeded(): void {
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch((err) => console.error("Failed to resume analyser audio context:", err));
  }
}

/** Current RMS amplitude, roughly 0 (silence) to ~1 (loud). Returns 0 if
 *  the analyser isn't set up, the context is suspended, or nothing is
 *  actually playing right now. */
export function getRMS(): number {
  if (!analyser || !dataArray || !ctx || ctx.state !== "running") return 0;
  if (!boundEl || boundEl.paused) return 0;
  try {
    analyser.getByteTimeDomainData(dataArray as Uint8Array<ArrayBuffer>);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128; // -1..1
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / dataArray.length);
  } catch {
    return 0;
  }
}
