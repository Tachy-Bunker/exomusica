// Themes: a branch can set the look (mood, sky, flock) for itself and everything below it. A room's own settings win; what it leaves empty comes from the nearest theme above.
import type { Flock, Grade, RoomDoc, Sky } from "./roomDoc";

export interface Look { grade: Grade | null; sky: Sky | null; flock: Flock | null }
export const THEME_PREFIX = "theme~";
export const themeKey = (slug: string): string => THEME_PREFIX + slug;
/** The slugs above `slug` in the branch tree, nearest first (secret branches have no slug and are skipped). */
export function lineageOf(chart: readonly { id: number; parentId: number | null; slug?: string | null }[], slug: string): string[] {
  const by = new Map(chart.map((b) => [b.id, b])), me = chart.find((b) => b.slug === slug), out: string[] = []; let p = me?.parentId ?? null;
  for (let i = 0; p != null && i < 12; i++) { const b = by.get(p); if (!b) break; if (b.slug) out.push(b.slug); p = b.parentId; }
  return out;
}
/** `themes` are the theme documents for the room itself and then each branch above, nearest first (null where there is none). Returns the look and where each part came from ("" = this room). */
export function effectiveLook(own: RoomDoc, themes: readonly (RoomDoc | null)[], slugs: readonly string[] = []): { look: Look; from: { grade: string | null; sky: string | null; flock: string | null } } {
  const look: Look = { grade: own.grade, sky: own.sky, flock: own.flock }, from = { grade: own.grade ? "" : null, sky: own.sky ? "" : null, flock: own.flock ? "" : null } as { grade: string | null; sky: string | null; flock: string | null };
  if (!own.inherit) return { look, from };
  for (let i = 0; i < themes.length; i++) {
    const t = themes[i]; if (!t) continue;
    if (!look.grade && t.grade) { look.grade = t.grade; from.grade = slugs[i] ?? "?"; }
    if (!look.sky && t.sky) { look.sky = t.sky; from.sky = slugs[i] ?? "?"; }
    if (!look.flock && t.flock) { look.flock = t.flock; from.flock = slugs[i] ?? "?"; }
  }
  return { look, from };
}
