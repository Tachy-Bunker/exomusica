import { Username } from "../components/Username";
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
  useDocumentTitle("XenoLab");
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
        // The live demo is a nicety: if that study can't be loaded, the page just shows the built-in example.
        api<StudyDetail>(`/api/studies/${mostRecent.slug}`).then((detail) => {
          const chart = detail.charts?.find((c) => c.kind !== "TABLE");
          if (chart) {
            setDemoCsv(chart.dataCsv);
            setDemoKind(chart.kind as "LINE" | "BAR" | "SCATTER");
            setUsingRealData(true);
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  async function startStudy() {
    if (!newTitle.trim()) return;
    const created = await api<{ slug: string }>("/api/studies", { method: "POST", body: JSON.stringify({ title: newTitle.trim() }) });
    navigate(`/study/${created.slug}`);
  }

  return (
    <div className="page-column xl2" data-testid="xenolab-page">
      <header className="xl2-head">
        <h1>XenoLab</h1>
        <p className="home-dim">Study sound. Share what you find.</p>
      </header>
      <div className="xl2-start">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") startStudy(); }} placeholder="Start a new study..." aria-label="Title of a new study" />
        <button className="btn btn-primary" onClick={startStudy}>Start a study</button>
      </div>

      <div className="xl2-grid">
        <section id="xl-research" className="xl2-card" aria-labelledby="xl-research-h" data-testid="xenolab-research">
          <header className="xl-head"><h2 id="xl-research-h">Research</h2><span className="xl-kind xl-kind-knowledge">Knowledge</span></header>
          <ul className="xl2-list">
            {studies.slice(0, 6).map((s) => (
              <li key={s.slug}><Link to={`/study/${s.slug}`}><b>{s.title}</b></Link><span className="home-dim"> <Username name={s.owner} /> · {s.status === "COMPLETE" ? "complete" : "in progress"}</span></li>
            ))}
          </ul>
          {studies.length === 0 && <p className="home-dim">No studies yet. Yours could be the first.</p>}
          <p className="xl-links"><Link to="/studies">All studies</Link><Link to="/wiki">Read the Log</Link></p>
        </section>

        <div className="xl2-tools">
          <section id="xl-processing" className="xl2-card" aria-labelledby="xl-processing-h" data-testid="xenolab-processing">
            <header className="xl-head"><h2 id="xl-processing-h">Audio processing</h2><span className="xl-kind xl-kind-tool">Tool · changes sound</span></header>
            <Link className="xl2-tool" to="/lab/voice"><b>Voice lab</b><span className="home-dim">Clean up and level a recording</span></Link>
          </section>

          <section id="xl-analysis" className="xl2-card" aria-labelledby="xl-analysis-h" data-testid="xenolab-analysis">
            <header className="xl-head"><h2 id="xl-analysis-h">Analysis</h2><span className="xl-kind xl-kind-tool">Tool · measures sound</span></header>
            <ul className="xl2-list xl2-small">
              <li><b>Analyze this clip</b> <span className="home-dim">pitch, loudness and more, inside a study</span></li>
              <li><b>Import labels</b> <span className="home-dim">from Audacity, REAPER or Praat</span></li>
            </ul>
            <details className="xl2-demo" data-testid="xenolab-chart-tool">
              <summary>Plot your own data</summary>
              <p className="xl2-demo-note">{usingRealData ? "Live data from a recent study. Edit it yourself:" : "Paste numbers and watch the chart draw:"}</p>
              <select value={demoKind} onChange={(e) => setDemoKind(e.target.value as typeof demoKind)} aria-label="Chart type" style={{ marginBottom: "0.4rem" }}>
                <option value="LINE">Line</option>
                <option value="BAR">Bar</option>
                <option value="SCATTER">Scatter</option>
              </select>
              <textarea value={demoCsv} onChange={(e) => { setDemoCsv(e.target.value); setUsingRealData(false); }} rows={6} aria-label="Chart data" style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
              <StudyChartView kind={demoKind} xLabel={null} yLabel={null} dataCsv={demoCsv} />
            </details>
          </section>
        </div>
      </div>
      <p className="home-dim xl2-note">What the tools produce can go straight into a study.</p>
    </div>
  );
}
