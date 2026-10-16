// The room's hum: a quiet bed of sound while a visitor is in the room (a drone, soft moving air, or a slow pulse).
// One AudioContext, faded in and out, silent until the browser allows audio. Nothing runs when the room has none.
import { getCurrentSfxVolume } from "./volumeMixerStore";

const LEVEL = 0.05, FADE = 1.2; // quiet, under everything; seconds to fade in or out
type Bed = { kind: number; g: GainNode; src: AudioScheduledSourceNode[] };
let ctx: AudioContext | null = null, bed: Bed | null = null;

/** Sets the room's hum: 0 none, 1 drone, 2 air, 3 pulse. The same kind keeps playing; another kind fades the old one out first. */
export function setHum(kind: number): void {
  if ((bed?.kind ?? 0) === kind) return;
  if (bed) fade(bed);
  bed = null;
  if (!kind || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
    ctx ??= new AC(); if (ctx.state === "suspended") void ctx.resume();
    const c = ctx, t0 = c.currentTime, g = c.createGain(), level = Math.max(0.0002, LEVEL * getCurrentSfxVolume()), src: AudioScheduledSourceNode[] = [];
    g.connect(c.destination);
    if (kind === 1) { // drone: two low sines a few cents apart
      for (const f of [55, 55.35]) { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(t0); src.push(o); }
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + FADE);
    } else if (kind === 2) { // air: band-passed noise
      const n = c.createBufferSource(), buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = buf; n.loop = true; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 340; bp.Q.value = 0.7;
      n.connect(bp); bp.connect(g); n.start(t0); src.push(n);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + FADE);
    } else { // pulse: a low tone that swells and falls every five seconds (0.2 Hz, never a flash)
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 110; o.connect(g); o.start(t0); src.push(o);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.2; lg.gain.value = level / 2; lfo.connect(lg); lg.connect(g.gain); lfo.start(t0); src.push(lfo);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level / 2, t0 + FADE);
    }
    bed = { kind, g, src };
  } catch { bed = null; /* no audio */ }
}

function fade(b: Bed): void {
  try {
    const c = ctx!, t = c.currentTime;
    b.g.gain.cancelScheduledValues(t); b.g.gain.setValueAtTime(b.g.gain.value, t); b.g.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
    for (const s of b.src) s.stop(t + FADE + 0.1);
  } catch { /* already stopped */ }
}
