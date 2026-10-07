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
    <div className="page-column xl" style={{ maxWidth: 940 }} data-testid="xenolab-page">
      <h1>XenoLab</h1>
      <p className="home-lede" style={{ marginBottom: "0.6rem" }}>Study sound. Share what you find. Tools to work on a sound, and studies that keep what you learn.</p>

      <ol className="xl-flow" aria-label="How the lab fits together" data-testid="xenolab-flow">
        <li><a href="#xl-processing"><b>1 · Process</b><span>change the audio</span></a></li>
        <li aria-hidden="true" className="xl-arrow">→</li>
        <li><a href="#xl-analysis"><b>2 · Analyze</b><span>measure it</span></a></li>
        <li aria-hidden="true" className="xl-arrow">→</li>
        <li><a href="#xl-research"><b>3 · Document</b><span>write it up in a study</span></a></li>
      </ol>

      <section id="xl-research" className="xl-block" aria-labelledby="xl-research-h" data-testid="xenolab-research">
        <header className="xl-head"><h2 id="xl-research-h">Research</h2><span className="xl-kind xl-kind-knowledge">Knowledge</span></header>
        <p className="home-dim xl-sub">Studies are where results are written down, shared and discussed. Everything the tools below produce can be put into one.</p>
        <div style={{ display: "flex", gap: "0.6rem", margin: "0.8rem 0", flexWrap: "wrap" }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") startStudy(); }} placeholder="Start a new study..." aria-label="Title of a new study" style={{ flex: "1 1 240px" }} />
          <button className="btn btn-primary" onClick={startStudy}>Start a study</button>
        </div>
        <h3 className="xl-h3">Recently active</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {studies.slice(0, 6).map((s) => (
            <Link key={s.slug} to={`/study/${s.slug}`} className="home-card xl-study">
              <span className="home-card-title">{s.title}</span>
              <span className="home-dim home-card-meta">by {s.owner} · {s.status === "COMPLETE" ? "complete" : "in progress"}</span>
            </Link>
          ))}
          {studies.length === 0 && <p className="home-dim">No studies yet. Yours could be the first.</p>}
        </div>
        <p className="xl-links"><Link to="/studies">All studies</Link><Link to="/wiki">Read the Log (wiki and news)</Link></p>
      </section>

      <section id="xl-processing" className="xl-block" aria-labelledby="xl-processing-h" data-testid="xenolab-processing">
        <header className="xl-head"><h2 id="xl-processing-h">Audio processing</h2><span className="xl-kind xl-kind-tool">Tool · changes sound</span></header>
        <p className="home-dim xl-sub">These take a recording in and give a different recording back.</p>
        <div className="home-grid">
          <Link className="home-card" to="/lab/voice">
            <span className="home-card-title">Voice lab</span>
            <span className="home-dim home-card-meta">Clean up and level a voice recording. Record a voice note to keep in a study.</span>
          </Link>
        </div>
      </section>

      <section id="xl-analysis" className="xl-block" aria-labelledby="xl-analysis-h" data-testid="xenolab-analysis">
        <header className="xl-head"><h2 id="xl-analysis-h">Analysis</h2><span className="xl-kind xl-kind-tool">Tool · measures sound</span></header>
        <p className="home-dim xl-sub">These leave the audio alone and measure it. They work on clips inside a study, and the results become charts there.</p>
        <ul className="xl-list">
          <li><b>Analyze this clip</b> <span className="home-dim">pitch, loudness, brightness and note starts of a clip in a study</span></li>
          <li><b>Import labels</b> <span className="home-dim">bring in markers from Audacity, REAPER or Praat as cited clips</span></li>
          <li><b>Plot your own data</b> <span className="home-dim">paste numbers below and see a chart straight away</span></li>
        </ul>
        <p className="xl-links"><a href="#xl-research">Open or start a study to analyze a clip</a></p>
        <div className="xl-demo">
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "0 0 0.4rem" }}>
            {usingRealData ? "Live data from a recent study - edit it yourself:" : "Try it - paste your own data and watch it render instantly:"}
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px" }}>
              <select value={demoKind} onChange={(e) => setDemoKind(e.target.value as typeof demoKind)} aria-label="Chart type" style={{ marginBottom: "0.4rem" }}>
                <option value="LINE">Line</option>
                <option value="BAR">Bar</option>
                <option value="SCATTER">Scatter</option>
              </select>
              <textarea value={demoCsv} onChange={(e) => { setDemoCsv(e.target.value); setUsingRealData(false); }} rows={8} aria-label="Chart data" style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
            </div>
            <div style={{ flex: "1 1 300px" }}>
              <StudyChartView kind={demoKind} xLabel={null} yLabel={null} dataCsv={demoCsv} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
