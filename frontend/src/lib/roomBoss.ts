// A boss made of sound: one number (the seed) fixes its scale, voice, figure and motifs. Call and response: it states a motif, you answer on the pad, it mutates the motif.
// No hit points, nothing to lose: a wrong answer just means it plays again. Pure, so it is tested without a browser.

export const BOSS_ROUNDS = 3;
const MODES: readonly (readonly number[])[] = [
  [0, 2, 3, 5, 7, 9, 10],   // dorian
  [0, 1, 3, 5, 7, 8, 10],   // phrygian
  [0, 2, 4, 6, 7, 9, 11],   // lydian
  [0, 2, 4, 5, 7, 9, 10],   // mixolydian
  [0, 2, 3, 5, 7, 8, 11],   // harmonic minor
  [0, 1, 4, 5, 7, 8, 11],   // double harmonic
];
/** A small seeded random stream (mulberry32): same seed, same numbers, on every device. */
export function rng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export interface BossVoice { root: number; scale: readonly number[]; partials: { ratio: number; gain: number }[]; len: number }
/** Its voice: a root pitch, a seven-note scale, two to four partials. `diff` 0..2 sets the motif length (3..5). */
export function voiceOf(seed: number, diff = 0): BossVoice {
  const r = rng(seed), scale = MODES[Math.floor(r() * MODES.length)], root = 110 * Math.pow(2, Math.floor(r() * 12) / 12);
  const n = 2 + Math.floor(r() * 3), partials: BossVoice["partials"] = [{ ratio: 1, gain: 1 }];
  for (let i = 1; i < n; i++) partials.push({ ratio: [2, 3, 1.5, 4, 5][Math.floor(r() * 5)] + (r() - 0.5) * 0.01, gain: 0.5 / i });
  return { root, scale, partials, len: 3 + Math.max(0, Math.min(2, Math.round(diff))) };
}
/** Frequency of scale degree `d` (0..6; 7 and up go an octave higher). */
export const freqOf = (v: BossVoice, d: number): number => v.root * Math.pow(2, (v.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7)) / 12);
/** The motif it states in round `r` (0-based): the first is drawn from the seed, then it is played backwards, then upside down. No note repeats twice in a row. */
export function motifOf(seed: number, diff: number, r: number): number[] {
  const v = voiceOf(seed, diff), g = rng(seed ^ 0x51ed270b), base: number[] = [];
  for (let i = 0; i < v.len; i++) { let d = Math.floor(g() * 7); if (i && d === base[i - 1]) d = (d + 1 + Math.floor(g() * 5)) % 7; base.push(d); }
  return r === 0 ? base : r === 1 ? [...base].reverse() : base.map((d) => 6 - d);
}
/** Does the reply match? `ok` when it is the whole motif; `right` how many notes in a row were correct from the start. */
export function judge(reply: readonly number[], motif: readonly number[]): { ok: boolean; right: number } {
  let right = 0; while (right < reply.length && right < motif.length && reply[right] === motif[right]) right++;
  return { ok: right === motif.length && reply.length === motif.length, right };
}
export interface Ring { sides: number; r: number; spin: number; y: number }
/** Its body: three to five stacked rings, each its own polygon, size and slow turn. */
export function figureOf(seed: number): Ring[] {
  const g = rng(seed ^ 0x2f6a1c3d), n = 3 + Math.floor(g() * 3), rings: Ring[] = [];
  for (let i = 0; i < n; i++) rings.push({ sides: 3 + Math.floor(g() * 6), r: 0.35 + 0.65 * Math.abs(Math.sin((i + 1 + g()) * 1.1)), spin: (g() - 0.5) * 0.9, y: (i + 0.5) / n });
  return rings;
}

// ---- who has been answered (this device)
const KEY = "exomusica_bosses";
export const bossKey = (slug: string, id: string): string => `${slug}/${id}`;
const read = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); } };
export const isBeaten = (key: string): boolean => read().has(key);
export function markBeaten(key: string): void { try { const s = read(); s.add(key); localStorage.setItem(KEY, JSON.stringify([...s].slice(-300))); } catch { /* storage blocked */ } }
