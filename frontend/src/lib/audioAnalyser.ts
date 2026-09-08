// IMPORTANT: this module exists purely for visual reactivity (RMS-driven
// animation). It must never be able to break actual audio playback — if
// anything here fails, visuals simply stay non-reactive; audio keeps
// playing normally regardless. Every operation that touches the shared
// AudioContext or the <audio> element's routing is wrapped so a failure
// can't propagate and silence playback.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array | null = null;
let boundEl: HTMLAudioElement | null = null;
let gainNode: GainNode | null = null;

// Guards against calling createMediaElementSource twice on the same
// element, which throws — the WeakSet survives across bindAudioElement
// re-calls even if the analyser setup itself is skipped on a later call.
const sourcedElements = new WeakSet<HTMLAudioElement>();

export function initAnalyser(el: HTMLAudioElement): void {
  if (sourcedElements.has(el)) {
    boundEl = el;
    return; // already wired up for this exact element
  }
  try {
    if (!ctx) ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 1; // neutral until a track's ReplayGain value is applied
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    // Critical: connect all the way through to the destination, or the
    // element's audio output gets rerouted into this graph and never
    // reaches speakers — this chain is what keeps playback audible.
    source.connect(gain);
    gain.connect(node);
    node.connect(ctx.destination);
    analyser = node;
    gainNode = gain;
    dataArray = new Uint8Array(node.fftSize);
    sourcedElements.add(el);
    boundEl = el;
  } catch (err) {
    // Any failure here (e.g. a stricter browser policy) just means no
    // reactive visuals — never touch playback itself in this catch.
    console.error("Audio analyser setup failed (visuals only, playback unaffected):", err);
  }
}

/** Sets the ReplayGain adjustment for the currently playing track, in dB
 *  (converted to a linear multiplier). Safe to call even if the gain
 *  node was never set up (e.g. analyser setup failed) — playback is
 *  never affected either way, it just won't be volume-normalized. */
export function setReplayGainDb(db: number | null): void {
  if (!gainNode || !ctx) return;
  try {
    const linear = db === null ? 1 : Math.pow(10, db / 20);
    gainNode.gain.setTargetAtTime(linear, ctx.currentTime, 0.05); // short ramp avoids an audible click on track change
  } catch {
    // Never let a gain-setting failure affect playback.
  }
}

/** This context is created suspended by default and browsers require an
 *  explicit resume tied to a user gesture — without this, the main
 *  player's audio (routed through this context once initAnalyser runs)
 *  goes completely silent with no error, since .play() on the element
 *  still succeeds even though the graph it feeds into isn't running.
 *  Called from audioStore.play() itself, synchronously, so the resume
 *  request happens in the exact same gesture as the click that triggered
 *  playback — the safest possible timing for browser autoplay policy. */
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
