export const sectionOf = (p: string): string => p.split("/")[1] ?? "";

/** Branch pages are /branch/:slug; the door wears that branch's colour. */
export function branchSlugOf(path: string): string | null {
  const m = /^\/branch\/([^/?#]+)/.exec(path);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface ClickInfo { button: number; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean; defaultPrevented: boolean }
export interface AnchorInfo { href: string | null; target: string | null; download: boolean; origin: string; noDoor: boolean }

/** The path to walk through a door when this click should play it; null leaves the click alone. */
export function doorTarget(click: ClickInfo, a: AnchorInfo, currentPath: string): string | null {
  if (click.defaultPrevented || click.button !== 0 || click.meta || click.ctrl || click.shift || click.alt) return null;
  if (!a.href || a.noDoor || a.download || (a.target && a.target !== "_self")) return null;
  let u: URL;
  try { u = new URL(a.href, a.origin); } catch { return null; }
  if (u.origin !== a.origin) return null;
  if (sectionOf(u.pathname) === sectionOf(currentPath)) return null;
  return u.pathname + u.search + u.hash;
}

/** Ready to open: the target page is shown, nothing is loading, it has been quiet a moment, and the door has been shut long enough to read as a door. */
export function readyToOpen(s: { onTarget: boolean; inflight: number; fog: boolean; quietMs: number; closedMs: number }): boolean {
  return s.onTarget && s.inflight === 0 && !s.fog && s.quietMs >= 120 && s.closedMs >= 250;
}
