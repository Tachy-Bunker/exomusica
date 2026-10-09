export const MAX_COMMENTS_PER_TRACK = 400;
export const MAX_COMMENT_CHARS = 240;

/** One short line of text: control characters and runs of whitespace collapsed, trimmed, capped. */
export function cleanCommentBody(v: unknown): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT_CHARS);
}

/** A time on the track: finite, never negative, never past the end (when the length is known). */
export function clampAt(v: unknown, duration: number | null): number {
  const n = Number(v);
  const t = Number.isFinite(n) ? Math.max(0, n) : 0;
  const capped = duration && duration > 0 ? Math.min(t, duration) : Math.min(t, 24 * 3600);
  return Math.round(capped * 10) / 10;
}

/** Comments close together share a marker so the strip stays readable: groups of pins within `gap` seconds. */
export function groupPins<T extends { atSeconds: number }>(items: T[], gap: number): T[][] {
  const out: T[][] = [];
  for (const it of [...items].sort((a, b) => a.atSeconds - b.atSeconds)) {
    const last = out[out.length - 1];
    if (last && it.atSeconds - last[last.length - 1].atSeconds <= gap) last.push(it); else out.push([it]);
  }
  return out;
}
