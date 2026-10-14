export const WALL_PAGE = 48;

/** "1,2,x,3,3" -> [1,2,3]: whole positive numbers only, no repeats, at most `max`. */
export function parseIds(raw: unknown, max = WALL_PAGE): number[] {
  if (typeof raw !== "string") return [];
  const out: number[] = [];
  for (const part of raw.split(",")) { const n = Number(part); if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n); if (out.length >= max) break; }
  return out;
}
