/** Echo, the testable part: deciding when a ring should leave the playhead. No DOM, no audio. */
export interface Ring { id: number; s: number } // s: strength 0..1

/** An onset detector. Feed it the current loudness (0..1) about fifteen times a second; it answers 0 (nothing) or a strength 0.25..1 when the sound jumps above its own recent average. A steady drone never fires; a hit does; hits closer than `gapMs` count as one. */
export function makeOnset(gapMs = 180) {
  let avg = 0, last = -1e9, warm = 0;
  return (rms: number, nowMs: number): number => {
    const level = Number.isFinite(rms) && rms > 0 ? Math.min(1, rms) : 0;
    if (warm < 3) { warm++; avg += (level - avg) / warm; return 0; } // learn the room before judging
    const hit = level > avg * 1.35 + 0.015 && nowMs - last >= gapMs;
    const strength = hit ? Math.min(1, Math.max(0.25, (level - avg) * 4)) : 0;
    avg += (level - avg) * (level > avg ? 0.4 : 0.08); // rises fast enough that a held note stops firing, falls slowly so the next hit stands out
    if (hit) last = nowMs;
    return strength;
  };
}

/** Keep at most `max` rings alive. */
export const addRing = (rings: Ring[], ring: Ring, max = 4): Ring[] => [...rings.slice(-(max - 1)), ring];
