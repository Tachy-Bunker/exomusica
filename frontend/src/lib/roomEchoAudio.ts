// The sound of a ping: a short blip, a tick as the ring meets each wall, a bell at its own note for each sealed door, a soft tink for anything unscanned. Only runs when a ping is sent.
import { ECHO_RANGE, ECHO_SPEED, type EchoField } from "./roomEcho";
import { wallsOf, type RoomWorld } from "./roomWorld";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}
function voice(c: AudioContext, at: number, f0: number, f1: number, dur: number, gain: number, pan: number, type: OscillatorType): void {
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let tail: AudioNode = g; o.connect(g);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); tail = p; }
  tail.connect(c.destination); o.start(at); o.stop(at + dur + 0.05);
}
/** Sound the ping that was just sent from (x,z) looking along yaw. */
export function playEcho(world: RoomWorld, field: EchoField, x: number, z: number, yaw: number): void {
  const c = audio(); if (!c) return; const t = c.currentTime + 0.01, rx = -Math.sin(yaw), rz = Math.cos(yaw);
  const pan = (px: number, pz: number): number => { const dx = px - x, dz = pz - z, L = Math.hypot(dx, dz) || 1; return (dx * rx + dz * rz) / L; };
  voice(c, t, 1100, 640, 0.09, 0.1, 0, "sine");
  const walls = wallsOf(world);
  for (let k = 0; k < walls.length; k++) { // the wall answers when the ring reaches it
    const nx = walls[k].nx, nz = walls[k].nz, d = walls[k].d - (x * nx + z * nz); if (d > ECHO_RANGE) continue;
    voice(c, t + d / ECHO_SPEED, 420 + (k % 4) * 70, 300, 0.16, 0.05 / (1 + d / 6), pan(x + nx * d, z + nz * d), "triangle");
  }
  let heard = 0;
  for (let i = 0; i < field.n && heard < 14; i++) {
    const d = Math.hypot(field.tx[i] - x, field.tz[i] - z); if (d > ECHO_RANGE) continue;
    if (field.seal[i]) { heard++; const at = t + d / ECHO_SPEED, p = pan(field.tx[i], field.tz[i]), g = 0.1 / (1 + d / 8); voice(c, at, field.freq[i], field.freq[i], 1.6, g, p, "sine"); voice(c, at, field.freq[i] * 2.01, field.freq[i] * 2.01, 0.7, g * 0.4, p, "sine"); }
    else if (!field.scanned[i]) { heard++; voice(c, t + d / ECHO_SPEED, 1760, 1760, 0.09, 0.035 / (1 + d / 10), pan(field.tx[i], field.tz[i]), "sine"); }
  }
}
/** The little rising tick of a finished scan. */
export function playScan(): void { const c = audio(); if (!c) return; const t = c.currentTime + 0.01; voice(c, t, 660, 990, 0.12, 0.07, 0, "triangle"); voice(c, t + 0.1, 990, 1320, 0.16, 0.06, 0, "sine"); }
