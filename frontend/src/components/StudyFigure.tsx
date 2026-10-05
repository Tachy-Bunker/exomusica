import { useMemo, type ReactNode } from "react";
import { StudyChartView } from "./StudyChartView";
import { numberCharts, type NumberedChart } from "../lib/figures";
import type { FigureKind } from "../lib/footnotes";

export interface FigureChart {
  id: number;
  title: string;
  kind: "LINE" | "BAR" | "SCATTER" | "TABLE";
  xLabel: string | null;
  yLabel: string | null;
  xLog?: boolean;
  yLog?: boolean;
  dataCsv: string;
}

const LABEL = { fig: "Figure", tab: "Table" } as const;

/** Everything the markdown renderer needs to place charts inline: how to draw one, and how many exist. */
export function useFigures(charts: FigureChart[]) {
  return useMemo(() => {
    const numbered: NumberedChart[] = numberCharts(charts);
    const byKey = new Map(numbered.map((c) => [`${c.kind}:${c.n}`, c]));
    const chartById = new Map(charts.map((c) => [c.id, c]));
    const counts = { fig: numbered.filter((c) => c.kind === "fig").length, tab: numbered.filter((c) => c.kind === "tab").length };
    const render = (kind: FigureKind, n: number): ReactNode | null => {
      const entry = byKey.get(`${kind}:${n}`);
      const chart = entry && chartById.get(entry.id);
      if (!chart) return null;
      return (
        <>
          <StudyChartView kind={chart.kind} xLabel={chart.xLabel} yLabel={chart.yLabel} xLog={chart.xLog} yLog={chart.yLog} dataCsv={chart.dataCsv} />
          <figcaption>
            <b>
              {LABEL[kind]} {n}.
            </b>{" "}
            {chart.title}
          </figcaption>
        </>
      );
    };
    return { numbered, counts, render };
  }, [charts]);
}
