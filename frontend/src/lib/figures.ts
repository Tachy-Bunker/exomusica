import type { FigureKind } from "./footnotes";

export interface ChartLike {
  id: number;
  kind: "LINE" | "BAR" | "SCATTER" | "TABLE";
}

export interface NumberedChart {
  id: number;
  kind: FigureKind;
  n: number;
}

/**
 * Figure and table numbers, as a paper would have them: charts are
 * "Figure 1, 2, ..." and TABLE-kind ones are "Table 1, 2, ..." - two
 * separate sequences, each in the charts' display order.
 */
export function numberCharts(charts: ChartLike[]): NumberedChart[] {
  const counts = { fig: 0, tab: 0 };
  return charts.map((c) => {
    const kind: FigureKind = c.kind === "TABLE" ? "tab" : "fig";
    counts[kind]++;
    return { id: c.id, kind, n: counts[kind] };
  });
}

/**
 * Given the numbering before and after a change (reorder, delete, or a
 * chart switching between figure and table), says what each existing
 * {fig:N}/{tab:N} reference should become. Unknown references are left
 * alone, and references to a chart that no longer exists are removed.
 */
export function figureRefRemap(before: NumberedChart[], after: NumberedChart[]) {
  const idOf = new Map(before.map((c) => [`${c.kind}:${c.n}`, c.id]));
  const afterById = new Map(after.map((c) => [c.id, c]));
  return (kind: FigureKind, n: number): { kind: FigureKind; n: number } | null => {
    const id = idOf.get(`${kind}:${n}`);
    if (id === undefined) return { kind, n };
    const now = afterById.get(id);
    return now ? { kind: now.kind, n: now.n } : null;
  };
}
