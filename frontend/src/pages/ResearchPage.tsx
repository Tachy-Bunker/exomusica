import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Username } from "../components/Username";
import { PlotTool } from "../components/xenolab/PlotTool";
import { LogPanel } from "../components/xenolab/LogPanel";
import { StudiesPanel, StudyCardView } from "../components/xenolab/StudiesPanel";
import { SoundAnalyzer } from "../components/SoundAnalyzer";
import { ChallengesPanel } from "./ChallengesPage";
import { SamplesPanel } from "./SampleBankPage";
import { api } from "../lib/api";
import { setPendingAnalysis } from "../lib/analyzerHandoff";
import { useAuth } from "../lib/auth";
import { timeAgo } from "../lib/relativeTime";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useUrlParams } from "../lib/useUrlParams";
import { LAB_TABS, parseTab, studyToContinue, type LabTab, type StudyCard } from "../lib/xenolab";

const VoiceLab = lazy(() => import("./VoiceLabPage").then((m) => ({ default: m.VoiceLabPage })));

interface ChallengeLite { id: number; title: string; prompt: string; active: boolean; submissionCount: number }
interface SampleLite { id: number; title: string; owner: string; kind: string; fileUrl: string }

function MiniDrop({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={`an-drop an-drop-mini${over ? " an-drop-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <input ref={ref} className="sr-only" type="file" accept="audio/*,video/*,.flac,.opus,.m4a" aria-label="Choose a sound file to analyze" data-testid="overview-drop-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <p className="an-drop-title">Drop a sound to measure it</p>
      <p className="home-dim">Loudness, pitch, tempo, key, problems. Stays on your device.</p>
      <button className="btn btn-primary" onClick={() => ref.current?.click()}>Choose a file</button>
    </div>
  );
}

function Overview({ studies, go }: { studies: StudyCard[] | null; go: (t: LabTab) => void }) {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeLite[]>([]);
  const [samples, setSamples] = useState<SampleLite[]>([]);
  useEffect(() => {
    api<ChallengeLite[]>("/api/challenges").then(setChallenges).catch(() => {});
    api<SampleLite[]>("/api/sample-bank").then((l) => setSamples(l.slice(0, 3))).catch(() => {});
  }, []);
  const cont = studies ? studyToContinue(studies, user?.username ?? null) : null;
  const challenge = challenges.find((c) => c.active) ?? null;
  const others = (studies ?? []).filter((s) => s.slug !== cont?.slug).slice(0, 3);

  return (
    <div data-testid="xenolab-overview">
      <div className="xl-two">
        <section className="xl2-card" aria-labelledby="xl-next-h" data-testid="xenolab-next">
          <header className="xl-head"><h2 id="xl-next-h">{cont ? "Pick up where you left off" : "Start something"}</h2></header>
          {cont ? (
            <>
              <b>{cont.title}</b>
              <p className="xl-card-text xl-clamp">{cont.excerpt || "No writing yet."}</p>
              <p className="home-dim xl-card-meta">Edited {timeAgo(Date.parse(cont.updatedAt))}</p>
              <div className="xl-card-actions"><Link className="btn btn-primary" to={`/study/${cont.slug}`} data-testid="xenolab-continue">Continue</Link><button className="btn" onClick={() => go("studies")}>New study</button></div>
            </>
          ) : user ? (
            <>
              <p>A study is a write-up with its own discussion: an experiment, a set of listening notes, a comparison.</p>
              <div className="xl-card-actions"><button className="btn btn-primary" onClick={() => go("studies")} data-testid="xenolab-start-first">Start a study</button></div>
            </>
          ) : (
            <>
              <p>Studies are write-ups with their own discussion: experiments, listening notes, comparisons.</p>
              <div className="xl-card-actions"><Link className="btn btn-primary" to="/login">Log in to start one</Link><button className="btn" onClick={() => go("studies")}>Read studies</button></div>
            </>
          )}
        </section>
        <section className="xl2-card" aria-labelledby="xl-an-h">
          <header className="xl-head"><h2 id="xl-an-h">Analyze a sound</h2><span className="xl-kind xl-kind-tool">Tool · measures sound</span></header>
          <MiniDrop onFile={(f) => { setPendingAnalysis({ blob: f, name: f.name }); go("analyze"); }} />
        </section>
      </div>

      <h2 className="home-h2 xl-h">Open now</h2>
      <div className="xl-three">
        <section className="xl2-card" aria-labelledby="xl-ch-h">
          <header className="xl-head"><h2 id="xl-ch-h">Challenge</h2></header>
          {challenge ? (<><b>{challenge.title}</b><p className="xl-card-text xl-clamp">{challenge.prompt}</p><p className="home-dim xl-card-meta">{challenge.submissionCount} submission{challenge.submissionCount === 1 ? "" : "s"}</p><div className="xl-card-actions"><button className="btn" onClick={() => go("challenges")}>Take it on</button></div></>) : <p className="home-dim">No open challenge right now.</p>}
        </section>
        <section className="xl2-card" aria-labelledby="xl-sm-h">
          <header className="xl-head"><h2 id="xl-sm-h">New samples</h2></header>
          {samples.length ? (<ul className="xl2-list">{samples.map((s) => <li key={s.id}><b>{s.title}</b> <span className="home-dim"><Username name={s.owner} /></span>{s.kind === "AUDIO" && <audio controls preload="none" src={s.fileUrl} className="xl-audio" aria-label={`Preview ${s.title}`} />}</li>)}</ul>) : <p className="home-dim">No samples yet.</p>}
          <div className="xl-card-actions"><button className="btn" onClick={() => go("samples")}>All samples</button></div>
        </section>
        <section className="xl2-card" aria-labelledby="xl-vl-h">
          <header className="xl-head"><h2 id="xl-vl-h">Voice lab</h2><span className="xl-kind xl-kind-tool">Tool · changes sound</span></header>
          <p>Clean up and level a recording, right in the browser.</p>
          <div className="xl-card-actions"><button className="btn" onClick={() => go("voice")}>Open</button></div>
        </section>
      </div>

      {others.length > 0 && (<>
        <div className="home-h2-row xl-h"><h2 className="home-h2">Latest studies</h2><button className="btn-link" onClick={() => go("studies")}>All studies</button></div>
        <ul className="xl-cards">{others.map((s) => <StudyCardView key={s.slug} s={s} />)}</ul>
      </>)}
    </div>
  );
}

export function ResearchPage() {
  useDocumentTitle("XenoLab");
  const [params, setParam] = useUrlParams();
  const tab = parseTab(params.get("tab"));
  const go = (t: LabTab) => { setParam("tab", t, "overview"); window.scrollTo({ top: 0 }); };
  const [studies, setStudies] = useState<StudyCard[] | null>(null);
  useEffect(() => { api<StudyCard[]>("/api/studies").then(setStudies).catch(() => setStudies([])); }, []);

  return (
    <div className="page-column xl2" data-testid="xenolab-page">
      <header className="xl2-head">
        <h1>XenoLab</h1>
        <p className="home-dim">Study sound, measure it, share what you find.</p>
      </header>
      <nav className="xl-tabs" aria-label="XenoLab sections">
        {LAB_TABS.map((t) => <button key={t.id} className={`xl-tab${tab === t.id ? " on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)} data-testid={`xl-tab-${t.id}`}>{t.label}</button>)}
      </nav>

      {tab === "overview" && <Overview studies={studies} go={go} />}
      {tab === "studies" && <StudiesPanel studies={studies} />}
      {tab === "analyze" && (
        <div>
          <SoundAnalyzer />
          <PlotTool latestSlug={studies?.[0]?.slug ?? null} />
          <p className="home-dim xl2-note">Inside a study you can also analyze a clip and import labels from Audacity, REAPER or Praat.</p>
        </div>
      )}
      {tab === "voice" && <Suspense fallback={<p className="home-dim">Loading…</p>}><VoiceLab embedded /></Suspense>}
      {tab === "samples" && <SamplesPanel onAnalyze={() => go("analyze")} />}
      {tab === "challenges" && <ChallengesPanel />}
      {tab === "log" && <LogPanel />}
    </div>
  );
}
