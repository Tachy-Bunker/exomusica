export interface MD { m: number; d: number }

/** "10-13" or "2026-10-13" -> month/day, or null when it isn't a real calendar day (Feb 29 is allowed). */
export function parseMonthDay(s: string | undefined, today = new Date()): MD | null {
  if (!s) return { m: today.getUTCMonth() + 1, d: today.getUTCDate() };
  const hit = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(s);
  if (!hit) return null;
  const m = Number(hit[1]), d = Number(hit[2]);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(2024, m, 0)).getUTCDate()) return null;
  return { m, d };
}

export const sameDay = (dt: Date, md: MD): boolean => dt.getUTCMonth() + 1 === md.m && dt.getUTCDate() === md.d;
export const dayString = (year: number, md: MD): string => `${year}-${String(md.m).padStart(2, "0")}-${String(md.d).padStart(2, "0")}`;

export interface YearBlock<A, S, M> { year: number; yearsAgo: number; albums: A[]; studies: S[]; chat: M | null }

/** Merges what happened on this day into one block per past year, newest year first. Years with nothing are left out. */
export function byYear<A extends { at: Date }, S extends { at: Date }, M>(thisYear: number, albums: A[], studies: S[], chat: Map<number, M>): YearBlock<A, S, M>[] {
  const years = new Set<number>([...albums.map((a) => a.at.getUTCFullYear()), ...studies.map((s) => s.at.getUTCFullYear()), ...chat.keys()]);
  return [...years].filter((y) => y < thisYear).sort((a, b) => b - a).map((year) => ({
    year, yearsAgo: thisYear - year,
    albums: albums.filter((a) => a.at.getUTCFullYear() === year),
    studies: studies.filter((s) => s.at.getUTCFullYear() === year),
    chat: chat.get(year) ?? null,
  }));
}
