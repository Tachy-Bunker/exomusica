// The maths behind the instrument view's traces and readouts. Pure, so it is tested without a browser.

export interface Box { w: number; h: number; padX: number; padY: number }

/** A "nice" top for the vertical scale so the trace never touches the frame: 4, 5, 8, 10, 20, 50 ... */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 2, 2.5, 5, 10]) if (max <= step * mag) return step * mag;
  return 10 * mag;
}

/** Points of a trace inside a box (x: oldest left, today right; y: zero at the bottom). `top` fixes the scale so traces can share one. */
export function tracePoints(values: number[], box: Box, top?: number): { x: number; y: number }[] {
  const max = top ?? niceMax(Math.max(0, ...values));
  const n = values.length;
  return values.map((v, i) => ({
    x: round(box.padX + (n === 1 ? (box.w - 2 * box.padX) / 2 : (i * (box.w - 2 * box.padX)) / (n - 1))),
    y: round(box.h - box.padY - (Math.min(v, max) / max) * (box.h - 2 * box.padY)),
  }));
}
const round = (n: number) => Math.round(n * 10) / 10;

export function linePath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}
/** The same line closed down to the baseline, to shade underneath it. */
export function areaPath(pts: { x: number; y: number }[], box: Box): string {
  if (pts.length === 0) return "";
  const base = round(box.h - box.padY);
  return `${linePath(pts)} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`;
}

/** The busiest day: its count, and how many days ago it was (0 = today). Null if nothing happened at all. */
export function peakOf(values: number[]): { value: number; ago: number } | null {
  let best = -1, idx = -1;
  values.forEach((v, i) => { if (v > best) { best = v; idx = i; } }); // the most recent of equal peaks wins: later days overwrite only when strictly greater, so scan from the end
  for (let i = values.length - 1; i >= 0; i--) if (values[i] === best) { idx = i; break; }
  return best > 0 ? { value: best, ago: values.length - 1 - idx } : null;
}

export type StatusWord = "Busy" | "Steady" | "Quiet" | "Silent";
/**
 * One word for how the system is doing: the last 24 hours compared with the daily average of the 13 days before today.
 * (A rolling 24 hours, not the calendar day, so it doesn't look "quiet" every morning.)
 */
export function statusOf(last24h: number, trace: number[]): { word: StatusWord; ratio: number | null } {
  const before = trace.slice(0, -1);
  const avg = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
  if (avg === 0) return { word: last24h > 0 ? "Steady" : "Silent", ratio: null };
  const ratio = last24h / avg;
  if (last24h === 0) return { word: "Silent", ratio };
  return { word: ratio >= 1.5 ? "Busy" : ratio >= 0.6 ? "Steady" : "Quiet", ratio };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "today", "yesterday", then "Oct 3" - the UTC date `ago` days before `now`. */
export function dayLabel(ago: number, now: number): string {
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  const d = new Date(now - ago * 86_400_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The channels worth drawing on the scope: the busiest few, by messages this week (those with none are left out). */
export function topChannels<T extends { week: number; slug: string }>(list: T[], n: number): T[] {
  return [...list].filter((c) => c.week > 0).sort((a, b) => b.week - a.week || a.slug.localeCompare(b.slug)).slice(0, n);
}
