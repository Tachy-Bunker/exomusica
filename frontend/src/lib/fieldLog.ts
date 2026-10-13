// The Field Log, the testable part: what a scan set unlocks. No DOM here.
export interface LogEntry { key: string; title: string; href: string; stages?: { key: string; label: string }[] }
export interface LogSection { id: string; title: string; entries: LogEntry[] }

/** Scan ids look like "kind|key"; the log only cares which keys were scanned. */
export const keysOf = (ids: Iterable<string>): Set<string> => { const s = new Set<string>(); for (const id of ids) s.add(id.slice(id.indexOf("|") + 1)); return s; };

export interface EntryState { unlocked: boolean; stagesDone: number; stagesTotal: number }
export function entryState(e: LogEntry, scanned: ReadonlySet<string>): EntryState {
  if (e.stages?.length) { const done = e.stages.filter((g) => scanned.has(g.key)).length; return { unlocked: scanned.has(e.key) || done > 0, stagesDone: done, stagesTotal: e.stages.length }; }
  return { unlocked: scanned.has(e.key), stagesDone: 0, stagesTotal: 0 };
}
export interface SectionStat { id: string; title: string; found: number; total: number; pct: number }
export function sectionStat(s: LogSection, scanned: ReadonlySet<string>): SectionStat {
  const found = s.entries.filter((e) => entryState(e, scanned).unlocked).length, total = s.entries.length;
  return { id: s.id, title: s.title, found, total, pct: total ? Math.floor((found / total) * 100) : 0 };
}
/** The soft nudge at the bottom of a page: how many authored points are still unfound, and never where. */
export function missingHint(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 scan point on this page is still unfound." : `${n} scan points on this page are still unfound.`;
}
/** The lines on the share card: section bars and a few unlocked titles. Nothing about the person. */
export function shareSummary(sections: LogSection[], scanned: ReadonlySet<string>, maxTitles = 6): { bars: SectionStat[]; titles: string[] } {
  const titles: string[] = [];
  for (const s of sections) for (const e of s.entries) if (titles.length < maxTitles && entryState(e, scanned).unlocked) titles.push(e.title);
  return { bars: sections.map((s) => sectionStat(s, scanned)), titles };
}
