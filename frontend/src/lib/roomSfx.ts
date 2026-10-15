// Tiny one-shot sounds for wires ("play chime"). One lazily-made AudioContext, short envelopes, nothing runs when idle.
import type { SOUNDS } from "./roomDoc";
type Snd = (typeof SOUNDS)[number];
let ctx: AudioContext | null = null, last = 0;
const NOTES: Record<Snd, { f: number[]; t: number; type: OscillatorType; g: number }> = {
  chime: { f: [880, 1320], t: 1.6, type: "sine", g: 0.12 },
  hum: { f: [55, 82.5], t: 2.4, type: "triangle", g: 0.2 },
  pulse: { f: [220], t: 0.5, type: "sine", g: 0.16 },
  drop: { f: [660, 110], t: 0.9, type: "sine", g: 0.14 },
  swell: { f: [165, 247.5], t: 3, type: "sawtooth", g: 0.05 },
};
/** Plays a soft sound. Silent when the browser has no audio or hasn't been unlocked yet; at most one sound per 80 ms. */
export function playSfx(name: string): void {
  const d = NOTES[name as Snd]; if (!d || typeof window === "undefined") return;
  const now = performance.now(); if (now - last < 80) return; last = now;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
    ctx ??= new AC(); if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(d.g, t0 + (name === "swell" ? d.t * 0.5 : 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d.t); g.connect(ctx.destination);
    d.f.forEach((f, i) => { const o = ctx!.createOscillator(); o.type = d.type; if (name === "drop") { o.frequency.setValueAtTime(d.f[0], t0); o.frequency.exponentialRampToValueAtTime(d.f[1], t0 + d.t); } else o.frequency.value = f; o.connect(g); o.start(t0 + i * 0.07); o.stop(t0 + d.t + 0.05); if (name === "drop") return; });
  } catch { /* no audio */ }
}

/** One soft note made of partials (`ratio`, `gain`), starting `when` seconds from now. Used by the boss voices. */
export function tone(freq: number, dur: number, partials: readonly { ratio: number; gain: number }[], when = 0, vol = 0.1): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
    ctx ??= new AC(); if (ctx.state === "suspended") void ctx.resume();
    const c = ctx, t0 = c.currentTime + when, g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); g.connect(c.destination);
    for (const p of partials) { const o = c.createOscillator(), pg = c.createGain(); o.type = "sine"; o.frequency.value = freq * p.ratio; pg.gain.value = p.gain; o.connect(pg); pg.connect(g); o.start(t0); o.stop(t0 + dur + 0.05); }
  } catch { /* no audio */ }
}
