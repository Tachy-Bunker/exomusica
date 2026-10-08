// The homepage's Featured articles: the slideshow's rules. Pure, so they are tested without a browser.

export interface FeaturedItem {
  id: number;
  kind: "study" | "news" | "wiki";
  title: string;
  href: string;
  by: string | null;
  text: string;
  imageUrl: string | null;
  imageOpacity: number | null;
  updatedAt: string | null;
}

export const IDLE_MS = 6500; // how long a slide stays when nobody is touching it
export const RESUME_MS = 12000; // after a person has used it, how long before it carries on by itself
export const DEFAULT_OPACITY = 0.35;

/** The slide after / before this one, wrapping round. */
export const stepIndex = (i: number, n: number, dir: 1 | -1 = 1): number => (n <= 0 ? 0 : (((i + dir) % n) + n) % n);

/** The card nearest to a camera position (in card pitches), kept inside the row. */
export const nearestIndex = (camera: number, pitch: number, n: number): number => Math.max(0, Math.min(n - 1, Math.round(camera / Math.max(1, pitch))));

/** How far the camera may be pulled past the first / last card while dragging (it springs back). */
export function clampCamera(x: number, pitch: number, n: number): number {
  const slack = pitch * 0.35;
  return Math.max(-slack, Math.min((n - 1) * pitch + slack, x));
}

/** The look of a card by its distance from the centre, in card pitches: the chosen one is full size, the rest sink away. */
export function cardLook(offset: number): { scale: number; opacity: number } {
  const d = Math.min(2.5, Math.abs(offset));
  return { scale: 1 - 0.13 * Math.min(1, d) - 0.04 * Math.max(0, d - 1), opacity: 1 - 0.28 * Math.min(1, d) - 0.18 * Math.max(0, d - 1) };
}

/** Where a released drag settles: a flick carries it on a little (velocity in px/s). */
export function settleIndex(camera: number, velocity: number, pitch: number, n: number): number {
  return nearestIndex(camera + velocity * 0.18, pitch, n);
}

/** Whether the slideshow should be moving on by itself right now. */
export function shouldAutoplay(o: { count: number; reducedMotion: boolean; hidden: boolean; inView: boolean; sinceTouchMs: number; hovering: boolean }): boolean {
  return o.count > 1 && !o.reducedMotion && !o.hidden && o.inView && !o.hovering && o.sinceTouchMs >= RESUME_MS;
}
