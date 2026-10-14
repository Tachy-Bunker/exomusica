// The shared, testable side of the jam room: the state shape, how a change is applied, notes and timing. No audio in here.

export const LANES = 4;
export const STEPS = 16;
export const LANE_NAMES = ["Kick", "Hat", "Bass", "Lead"] as const;
export type ScaleId = "minor-pent" | "dorian" | "whole-tone" | "phrygian-dom" | "just-7";
export interface JamState { tempo: number; root: number; scale: ScaleId; swing: number; steps: number[][]; muted: boolean[]; epoch: number }
export type JamOp =
  | { t: "step"; lane: number; step: number; v: number }
  | { t: "tempo"; v: number } | { t: "root"; v: number } | { t: "scale"; v: ScaleId } | { t: "swing"; v: number }
  | { t: "mute"; lane: number; v: boolean } | { t: "clear"; lane: number };

export const SCALE_LABEL: Record<ScaleId, string> = { "minor-pent": "Minor pentatonic (just)", dorian: "Dorian (just)", "whole-tone": "Whole tone", "phrygian-dom": "Phrygian dominant (just)", "just-7": "Major, 5-limit just" };
const T = (n: number) => Array.from({ length: n }, (_, k) => Math.pow(2, k / n));
export const SCALE_RATIOS: Record<ScaleId, number[]> = {
  "minor-pent": [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5],
  dorian: [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5],
  "whole-tone": T(6),
  "phrygian-dom": [1, 16 / 15, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 9 / 5],
  "just-7": [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8],
};
export const ROOTS: { label: string; hz: number }[] = [["A1", 55], ["C2", 65.41], ["D2", 73.42], ["E2", 82.41], ["G2", 98], ["A2", 110], ["C3", 130.81], ["D3", 146.83]].map(([label, hz]) => ({ label: label as string, hz: hz as number }));

/** Degree 1..8 of the scale as a frequency (degrees past the last note climb an octave). Bass sits an octave under the root, lead two above. */
export function freqOf(scale: ScaleId, root: number, degree: number, lane: number): number {
  const r = SCALE_RATIOS[scale], i = degree - 1;
  const oct = Math.floor(i / r.length);
  const f = root * r[i % r.length] * Math.pow(2, oct);
  return lane === 2 ? f / 2 : f * 4;
}

export const stepMs = (tempo: number): number => 60000 / tempo / 4;

export function applyOp(s: JamState, op: JamOp, now: number): JamState {
  switch (op.t) {
    case "step": return { ...s, steps: s.steps.map((row, i) => (i === op.lane ? row.map((x, j) => (j === op.step ? op.v : x)) : row)) };
    case "tempo": return { ...s, tempo: op.v, epoch: now };
    case "root": return { ...s, root: op.v };
    case "scale": return { ...s, scale: op.v };
    case "swing": return { ...s, swing: op.v };
    case "mute": return { ...s, muted: s.muted.map((m, i) => (i === op.lane ? op.v : m)) };
    case "clear": return { ...s, steps: s.steps.map((row, i) => (i === op.lane ? row.map(() => 0) : row)) };
  }
}

/** Steps that fall between two server-clock moments, counted from the room's epoch. Odd steps are pushed late by the swing. */
export function stepsBetween(fromMs: number, toMs: number, epoch: number, tempo: number, swing: number): { n: number; atMs: number }[] {
  const d = stepMs(tempo), out: { n: number; atMs: number }[] = [];
  for (let n = Math.max(0, Math.ceil((fromMs - epoch - d * swing) / d)); ; n++) {
    const at = epoch + n * d + (n % 2 === 1 ? swing * d : 0);
    if (at >= toMs) break;
    if (at >= fromMs) out.push({ n, atMs: at });
    if (out.length > 64) break;
  }
  return out;
}

/** The server-clock offset from a few ping round trips: the one with the shortest trip is the most trustworthy. */
export function clockOffset(samples: { sent: number; got: number; server: number }[]): number {
  let best = Infinity, off = 0;
  for (const s of samples) { const rtt = s.got - s.sent; if (rtt >= 0 && rtt < best) { best = rtt; off = s.server + rtt / 2 - s.got; } }
  return off;
}

export interface ChatLine { by: string; text: string; at: number }
