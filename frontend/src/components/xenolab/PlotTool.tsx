import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { StudyChartView } from "../StudyChartView";

const SAMPLE_CSV = "frequency,amplitude\n100,0.4\n250,0.9\n500,0.6\n1000,1.0\n2000,0.5\n4000,0.2";
interface StudyDetail { charts: { kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel: string | null; yLabel: string | null; dataCsv: string }[] }

/** Paste numbers, watch a chart draw. Starts from the most recent study's data when there is one. */
export function PlotTool({ latestSlug }: { latestSlug: string | null }) {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [kind, setKind] = useState<"LINE" | "BAR" | "SCATTER">("LINE");
  const [real, setReal] = useState(false);
  useEffect(() => {
    if (!latestSlug) return;
    let alive = true;
    // a nicety: if that study can't be loaded, the built-in example stays
    api<StudyDetail>(`/api/studies/${latestSlug}`).then((d) => {
      const chart = d.charts?.find((c) => c.kind !== "TABLE");
      if (alive && chart) { setCsv(chart.dataCsv); setKind(chart.kind as typeof kind); setReal(true); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [latestSlug]);
  return (
    <details className="xl2-demo" data-testid="xenolab-chart-tool">
      <summary>Plot your own data</summary>
      <p className="xl2-demo-note">{real ? "Live data from a recent study. Edit it yourself:" : "Paste numbers and watch the chart draw:"}</p>
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Chart type" style={{ marginBottom: "0.4rem" }}>
        <option value="LINE">Line</option>
        <option value="BAR">Bar</option>
        <option value="SCATTER">Scatter</option>
      </select>
      <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setReal(false); }} rows={6} aria-label="Chart data" style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
      <StudyChartView kind={kind} xLabel={null} yLabel={null} dataCsv={csv} />
    </details>
  );
}
