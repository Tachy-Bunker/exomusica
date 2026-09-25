import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { StudyChartView } from "../components/StudyChartView";

interface StudySummary {
  slug: string;
  title: string;
  status: "IN_PROGRESS" | "COMPLETE";
  owner: string;
  updatedAt: string;
}
interface StudyDetail {
  charts: { kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel: string | null; yLabel: string | null; dataCsv: string }[];
}

const SAMPLE_CSV = "frequency,amplitude\n100,0.4\n250,0.9\n500,0.6\n1000,1.0\n2000,0.5\n4000,0.2";

export function ResearchPage() {
  useDocumentTitle("Research");
  const navigate = useNavigate();
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [demoCsv, setDemoCsv] = useState(SAMPLE_CSV);
  const [demoKind, setDemoKind] = useState<"LINE" | "BAR" | "SCATTER">("LINE");
  const [newTitle, setNewTitle] = useState("");
  const [usingRealData, setUsingRealData] = useState(false);

  useEffect(() => {
    api<StudySummary[]>("/api/studies").then((data) => {
      setStudies(data);
      const mostRecent = data[0];
      if (mostRecent) {
        api<StudyDetail>(`/api/studies/${mostRecent.slug}`).then((detail) => {
          const chart = detail.charts.find((c) => c.kind !== "TABLE");
          if (chart) {
            setDemoCsv(chart.dataCsv);
            setDemoKind(chart.kind as "LINE" | "BAR" | "SCATTER");
            setUsingRealData(true);
          }
        });
      }
    });
  }, []);

  async function startStudy() {
    if (!newTitle.trim()) return;
    const created = await api<{ slug: string }>("/api/studies", { method: "POST", body: JSON.stringify({ title: newTitle.trim() }) });
    navigate(`/study/${created.slug}`);
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Study sound. Share what you find.</h1>
      <p style={{ color: "var(--text-dim)" }}>This is the lab, not the stage - document phenomena and build the ecosystem's shared knowledge.</p>

      <div style={{ display: "flex", gap: "0.6rem", margin: "1rem 0" }}>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Start a new study..." style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={startStudy}>
          Start a study
        </button>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem", marginTop: "1rem" }}>
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "0 0 0.4rem" }}>
          {usingRealData ? "Live data from a recent study - edit it yourself:" : "Try it - paste your own data and watch it render instantly:"}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <select value={demoKind} onChange={(e) => setDemoKind(e.target.value as typeof demoKind)} style={{ marginBottom: "0.4rem" }}>
              <option value="LINE">Line</option>
              <option value="BAR">Bar</option>
              <option value="SCATTER">Scatter</option>
            </select>
            <textarea
              value={demoCsv}
              onChange={(e) => {
                setDemoCsv(e.target.value);
                setUsingRealData(false);
              }}
              rows={8}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
            />
          </div>
          <div style={{ flex: "1 1 300px" }}>
            <StudyChartView kind={demoKind} xLabel={null} yLabel={null} dataCsv={demoCsv} />
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Recently active</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {studies.slice(0, 6).map((s) => (
          <Link key={s.slug} to={`/study/${s.slug}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem 0.7rem", textDecoration: "none", color: "inherit" }}>
            {s.title} <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>by {s.owner}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
