// The echo visor: a ping leaves you as a ring and sweeps the room. Whatever it passes answers: sealed doors with their note, anything unscanned with a marker. Pure.
import { signature, type Scannable } from "./roomLore";

export const ECHO_SPEED = 9, ECHO_RANGE = 18, ECHO_COOLDOWN = 2200, ECHO_HOLD = 7000, ECHO_RISE = 250;

export class EchoField {
  readonly n: number;
  readonly tx: Float64Array; readonly ty: Float64Array; readonly tz: Float64Array;
  readonly seal: Uint8Array;            // 1 = a sealed door (it answers with its note even once scanned)
  readonly door: Int16Array;            // index into the world's doors for a door, else -1
  readonly scanned: Uint8Array;         // 1 = already in the logbook (no marker)
  readonly at: Float64Array;            // when the ring reached it (ms), 0 = not yet
  readonly col: string[]; readonly note: string[]; readonly freq: Float64Array;
  x = 0; z = 0; t0 = 0; last = -1e9; live = false;

  constructor(list: Scannable[], doorIndex: (id: string) => number) {
    this.n = list.length;
    this.tx = new Float64Array(this.n); this.ty = new Float64Array(this.n); this.tz = new Float64Array(this.n);
    this.seal = new Uint8Array(this.n); this.door = new Int16Array(this.n).fill(-1); this.scanned = new Uint8Array(this.n); this.at = new Float64Array(this.n);
    this.col = []; this.note = []; this.freq = new Float64Array(this.n);
    list.forEach((s, i) => {
      this.tx[i] = s.x; this.ty[i] = s.y; this.tz[i] = s.z; this.seal[i] = s.what === "seal" ? 1 : 0;
      if (s.lockKind === "door") this.door[i] = doorIndex(s.id);
      const sig = signature(s.key.slice(s.key.lastIndexOf("/") + 1)); this.col.push(`hsl(${sig.hue},90%,66%)`); this.note.push(sig.note); this.freq[i] = sig.freq;
    });
  }
  /** Send a ring out from (x,z). False while the last one is still sounding. */
  ping(now: number, x: number, z: number): boolean {
    if (now - this.last < ECHO_COOLDOWN) return false;
    this.last = now; this.t0 = now; this.x = x; this.z = z; this.live = true; this.at.fill(0); return true;
  }
  /** How far the ring has got (metres). */
  radius(now: number): number { return this.live ? Math.min(ECHO_RANGE, ((now - this.t0) / 1000) * ECHO_SPEED) : 0; }
  /** 0..1: how bright the ring is. */
  ring(now: number): number { if (!this.live) return 0; const r = this.radius(now); return r >= ECHO_RANGE ? Math.max(0, 1 - (now - this.t0 - (ECHO_RANGE / ECHO_SPEED) * 1000) / 400) : 1 - (r / ECHO_RANGE) * 0.55; }
  /** Mark what the ring has passed; returns how many are new (the room repaints while anything is still glowing). */
  step(now: number): number {
    if (!this.live) return 0;
    const r = this.radius(now); let fresh = 0;
    for (let i = 0; i < this.n; i++) if (!this.at[i] && Math.hypot(this.tx[i] - this.x, this.tz[i] - this.z) <= r) { this.at[i] = now; fresh++; }
    if (now - this.t0 > (ECHO_RANGE / ECHO_SPEED) * 1000 + ECHO_HOLD + 600) this.live = false;
    return fresh;
  }
  /** 0..1: how strongly target i is answering now (rises quickly, holds, fades). */
  glow(i: number, now: number): number {
    const a = this.at[i]; if (!a) return 0; const age = now - a;
    return age < ECHO_RISE ? age / ECHO_RISE : age < ECHO_HOLD ? 1 : Math.max(0, 1 - (age - ECHO_HOLD) / 1200);
  }
  /** True while anything on screen still changes because of the visor. */
  busy(now: number): boolean { return this.live && (now - this.t0 < (ECHO_RANGE / ECHO_SPEED) * 1000 + ECHO_HOLD + 1200); }
  /** The ring reaches target i after this many ms (for scheduling its sound). */
  arrival(i: number, x: number, z: number): number { return (Math.hypot(this.tx[i] - x, this.tz[i] - z) / ECHO_SPEED) * 1000; }
}
