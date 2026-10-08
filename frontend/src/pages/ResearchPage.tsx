import { Suspense, lazy, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PlotTool } from "../components/xenolab/PlotTool";
import { StudiesPanel } from "../components/xenolab/StudiesPanel";
import { SoundAnalyzer } from "../components/SoundAnalyzer";
import { ChallengesPanel } from "./ChallengesPage";
import { SamplesPanel } from "./SampleBankPage";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { LAB_TABS, parseTab, type LabTab, type StudyCard } from "../lib/xenolab";

const VoiceLab = lazy(() => import("./VoiceLabPage").then((m) => ({ default: m.VoiceLabPage })));
const Contribute = lazy(() => import("./ContributePage").then((m) => ({ default: m.ContributePage })));

export function ResearchPage() {
  useDocumentTitle("XenoLab");
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));
  // switching section starts that section clean: another section's search or filter doesn't follow along
  const go = (t: LabTab) => { setParams(t === "studies" ? {} : { tab: t }, { replace: true }); window.scrollTo({ top: 0 }); };
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

      {tab === "studies" && <StudiesPanel studies={studies} />}
      {tab === "resources" && <SamplesPanel onAnalyze={() => go("analyze")} />}
      {tab === "analyze" && (
        <div>
          <SoundAnalyzer />
          <PlotTool latestSlug={studies?.[0]?.slug ?? null} />
        </div>
      )}
      {tab === "effects" && <Suspense fallback={<p className="home-dim">Loading…</p>}><VoiceLab embedded /></Suspense>}
      {tab === "open" && <ChallengesPanel />}
      {tab === "contribute" && <Suspense fallback={<p className="home-dim">Loading…</p>}><Contribute embedded /></Suspense>}
    </div>
  );
}
