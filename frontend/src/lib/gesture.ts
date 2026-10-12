// Pure helpers for the phone chat: swipes, sheet heights, the radial menu. Nothing here touches the page, so all of it is tested.

export type Swipe = "right" | "left" | "pull" | null;
/** What a finger drag means: mostly sideways, or mostly downward, past a threshold. Anything diagonal is just scrolling. */
export function swipeIntent(dx: number, dy: number, threshold = 64): Swipe {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= threshold && ax >= ay * 2) return dx > 0 ? "right" : "left";
  if (dy >= threshold && dy >= ax * 2) return "pull";
  return null;
}
/** A hold is still a hold if the finger has not wandered. */
export const stillHolding = (dx: number, dy: number, tol = 9): boolean => Math.hypot(dx, dy) <= tol;

export type Detent = "peek" | "half" | "full";
export const DETENTS: Detent[] = ["peek", "half", "full"];
export interface SheetSizes { peek: number; half: number; full: number }
export const sheetSizes = (viewportH: number, topGap = 56): SheetSizes => ({ peek: 168, half: Math.round(viewportH * 0.5), full: Math.max(240, viewportH - topGap) });
/** Where a drag ends up: the detent nearest to where the sheet would coast to (its height plus a little of its speed, positive speed = growing). */
export function snapDetent(heightPx: number, speedPxPerMs: number, s: SheetSizes): Detent {
  const aim = heightPx + speedPxPerMs * 160;
  let best: Detent = "peek", d = Infinity;
  for (const k of DETENTS) { const dist = Math.abs(s[k] - aim); if (dist < d) { d = dist; best = k; } }
  return best;
}
export const stepDetent = (cur: Detent, dir: 1 | -1): Detent => DETENTS[Math.min(2, Math.max(0, DETENTS.indexOf(cur) + dir))];

/** Slots of a fan of buttons around a point, opening upward: evenly across `spanDeg`, centred straight up. */
export function radialSlots(n: number, radius: number, spanDeg = 200): { x: number; y: number }[] {
  if (n <= 0) return [];
  const start = -90 - spanDeg / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = ((n === 1 ? -90 : start + (spanDeg * (i + 0.5)) / n) * Math.PI) / 180;
    return { x: Math.round(Math.cos(a) * radius), y: Math.round(Math.sin(a) * radius) };
  });
}
/** Keeps the whole fan on the screen: moves its centre in from the edges. */
export function fitCentre(x: number, y: number, reach: number, w: number, h: number): { x: number; y: number } {
  return { x: Math.min(w - reach, Math.max(reach, x)), y: Math.min(h - 40, Math.max(reach + 8, y)) };
}
/** Which fan button a finger is over (by angle and distance), or -1. */
export function slotAt(dx: number, dy: number, n: number, radius: number, size = 46, spanDeg = 200): number {
  const slots = radialSlots(n, radius, spanDeg);
  let hit = -1, best = size;
  slots.forEach((s, i) => { const d = Math.hypot(dx - s.x, dy - s.y); if (d < best) { best = d; hit = i; } });
  return hit;
}
