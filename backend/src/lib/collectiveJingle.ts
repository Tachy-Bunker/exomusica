// Collective jingle (milestone m-jingle): a short motif read out of the measured spectral strips of tracks whose creators allow reuse.
// Pure parts here; the strips come from the same cache the player uses. No audio is decoded anywhere.
import { POINT_COLS, POINT_ROWS, unpackPoints } from "./specStrip.js";

const LADDER = [0, 3, 5, 7, 10]; // minor pentatonic: any row lands on a note that sits with the others
export const BASE_HZ = 130.81;

/** Strip row (0 = lowest band) to a pitch on the ladder, four octaves up from C3. */
export function rowToHz(row: number): number {
  const r = Math.max(0, Math.min(POINT_ROWS - 1, Math.floor(row)));
  const semis = LADDER[r % 5] + 12 * Math.floor(r / 5);
  return Math.round(BASE_HZ * Math.pow(2, semis / 12) * 100) / 100;
}

/** The band that stands out most in each half of a track: the row whose mean level in that half is highest above its mean over the whole track. Null if the strip is not whole. */
export function standoutRows(packed: Uint8Array): [number, number] | null {
  const lv = unpackPoints(packed); if (!lv) return null;
  const half = POINT_COLS / 2, whole = new Float64Array(POINT_ROWS), part = [new Float64Array(POINT_ROWS), new Float64Array(POINT_ROWS)];
  for (let r = 0; r < POINT_ROWS; r++) for (let c = 0; c < POINT_COLS; c++) { const v = lv[r * POINT_COLS + c]; whole[r] += v; part[c < half ? 0 : 1][r] += v; }
  const pick = (p: Float64Array): number => {
    let best = 0, bestScore = -Infinity;
    for (let r = 0; r < POINT_ROWS; r++) { const score = p[r] / half - whole[r] / POINT_COLS + p[r] / half * 0.25; if (score > bestScore) { bestScore = score; best = r; } }
    return best;
  };
  return [pick(part[0]), pick(part[1])];
}

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** The same month always picks the same tracks in the same order. */
export function pickSources(ids: number[], month: string, n: number): number[] {
  return [...ids].sort((a, b) => fnv(`${month}:j:${a}`) - fnv(`${month}:j:${b}`) || a - b).slice(0, n);
}

/** Up to 8 notes (two per track, in pick order), as frequencies. Needs at least two tracks to count as a collective. */
export function motifFrom(strips: Uint8Array[]): number[] | null {
  const notes: number[] = [];
  for (const s of strips) { const r = standoutRows(s); if (r) notes.push(rowToHz(r[0]), rowToHz(r[1])); }
  return strips.length >= 2 && notes.length >= 4 ? notes.slice(0, 8) : null;
}
