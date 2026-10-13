/** One CSV cell. Quotes when needed, and defuses spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(",");
