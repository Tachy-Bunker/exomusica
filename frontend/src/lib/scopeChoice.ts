// Which channels the Scope draws. By default the busiest recently; the person can add, remove or reset. Pure, so it is tested without a browser.

export const SCOPE_DEFAULT = 8;
export const SCOPE_MAX = 12;
/** Twelve colours that stay apart on the dark theme (none is the blue of the overall line); a channel keeps its colour by its place in the list. */
export const SCOPE_COLORS = ["#e8b86f", "#6fd3a6", "#b99cff", "#f08fb0", "#6fe0e8", "#e8814a", "#9bc46a", "#f2b394", "#d6c34a", "#3fb5a8", "#e8695f", "#c9a7ff"];

interface Chan { slug: string; week: number; lastAt?: number | null }

/** The busiest channels this week (those with no messages are left out), ties broken by name so it never flickers. */
export function defaultScope(convs: Chan[], n = SCOPE_DEFAULT): string[] {
  return [...convs].filter((c) => c.week > 0).sort((a, b) => b.week - a.week || a.slug.localeCompare(b.slug)).slice(0, n).map((c) => c.slug);
}

/** What was saved, kept only where it still makes sense: channels that exist, once each, at most 12. Nothing saved means the default. */
export function normalizeScope(saved: unknown, convs: Chan[]): string[] {
  if (!Array.isArray(saved)) return defaultScope(convs);
  const exists = new Set(convs.map((c) => c.slug));
  const out: string[] = [];
  for (const s of saved) if (typeof s === "string" && exists.has(s) && !out.includes(s)) out.push(s);
  return out.slice(0, SCOPE_MAX);
}
export const addToScope = (list: string[], slug: string): string[] => (list.includes(slug) || list.length >= SCOPE_MAX ? list : [...list, slug]);
export const removeFromScope = (list: string[], slug: string): string[] => list.filter((s) => s !== slug);

const KEY = "exo.scope.v1";
export function loadScope(): unknown {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveScope(list: string[] | null): void {
  try { if (list === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: it just won't be remembered */ }
}

/** A click on a chat opens it in the chat dock first; clicking the same chat again (already in the dock) opens its page. Phones have no dock, and a modified click keeps its usual meaning. */
export function opensInDockFirst(o: { desktop: boolean; openSlug: string | null; slug: string; button: number; modifier: boolean }): boolean {
  return o.desktop && o.button === 0 && !o.modifier && o.openSlug !== o.slug;
}
