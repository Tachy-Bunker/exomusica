// Pure rules for how one track joins the next, and for the A/B pair. No DOM, no store: easy to test.

export type TransitionMode = "none" | "gapless" | "crossfade";
export interface Transition { mode: TransitionMode; ms: number }
export const NO_TRANSITION: Transition = { mode: "none", ms: 0 };

/** Gapless starts the next file a hair early and masks the encoder padding with a ~50 ms dip. */
export const GAPLESS_LEAD = 0.05;

/** Seconds before the end at which the next track starts. */
export function leadSeconds(t: Transition, duration: number): number {
  if (t.mode === "gapless") return GAPLESS_LEAD;
  if (t.mode === "crossfade") return Math.max(0.5, Math.min(t.ms / 1000, duration * 0.4));
  return 0;
}

/** A transition only applies between two consecutive tracks of the same (official) album. */
export function appliesTo(cur: { albumSlug: string; source: string } | null, next: { albumSlug: string; source: string } | undefined, t: Transition): boolean {
  return !!cur && !!next && t.mode !== "none" && cur.source === "official" && next.source === "official" && cur.albumSlug === next.albumSlug;
}

/** The playback time (in the current file) of the next thing that must happen, or null. A range end wins if it comes first. */
export function nextBoundary(o: { duration: number; currentTime: number; rangeEnd: number | null; lead: number | null }): number | null {
  const cands: number[] = [];
  if (o.rangeEnd != null && o.rangeEnd > o.currentTime - 0.01) cands.push(o.rangeEnd);
  if (o.lead != null && o.duration > 0) {
    const at = o.duration - o.lead;
    if (at > o.currentTime - 0.01) cands.push(at);
  }
  return cands.length ? Math.min(...cands) : null;
}

export interface AbRange { trackId: number; source: string; start: number; end: number }
export type AbSlot = "A" | "B";
export const AB_DEFAULT_LEN = 10;

/** Marks one edge of a slot. With nothing there yet, the other edge defaults to a short range. */
export function markRange(prev: AbRange | null, track: { id: number; source: string }, edge: "start" | "end", at: number, duration: number): AbRange {
  const t = Math.max(0, at);
  const sameTrack = prev && prev.trackId === track.id && prev.source === track.source;
  let start = sameTrack ? prev.start : t;
  let end = sameTrack ? prev.end : Math.min(duration || t + AB_DEFAULT_LEN, t + AB_DEFAULT_LEN);
  if (edge === "start") { start = t; if (!sameTrack || end <= start + 0.2) end = Math.min(duration || start + AB_DEFAULT_LEN, start + AB_DEFAULT_LEN); }
  else { end = t; if (!sameTrack || start >= end - 0.2) start = Math.max(0, end - AB_DEFAULT_LEN); }
  if (end <= start + 0.2) end = start + 0.2;
  return { trackId: track.id, source: track.source, start, end };
}

/** Where to land in `to` when flipping from `from` at playback position `pos`: the same distance into the range, so the two stay comparable. */
export function flipPosition(from: AbRange | null, to: AbRange, pos: number): number {
  const into = from ? Math.max(0, Math.min(pos - from.start, from.end - from.start)) : 0;
  const len = to.end - to.start;
  return to.start + Math.min(into, Math.max(0, len - 0.05));
}
