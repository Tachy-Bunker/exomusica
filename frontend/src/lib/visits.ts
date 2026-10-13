// Where you have been and what you were doing, kept on this device only. Everything swallows storage errors.
const VISITS = "exomusica_visits", LAST = "exomusica_lastplay";
const rd = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const wr = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const visitedSlugs = (): Set<string> => new Set(rd<string[]>(VISITS, []));
export function recordVisit(slug: string): void {
  const s = rd<string[]>(VISITS, []);
  if (s.includes(slug)) return;
  wr(VISITS, [...s, slug].slice(-300));
}
export interface LastPlay { branchSlug: string; title: string; at: number }
export const readLastPlay = (): LastPlay | null => { const v = rd<Partial<LastPlay> | null>(LAST, null); return v && typeof v.branchSlug === "string" ? { branchSlug: v.branchSlug, title: String(v.title ?? ""), at: Number(v.at) || 0 } : null; };
export const writeLastPlay = (p: LastPlay): void => wr(LAST, p);
