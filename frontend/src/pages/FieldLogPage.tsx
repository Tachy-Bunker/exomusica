import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { scannedIds, syncScans } from "../lib/scanLog";
import { entryState, keysOf, sectionStat, shareSummary, type LogSection } from "../lib/fieldLog";
import { Loading } from "../components/Loading";

/** Everything you have probed, as a log: unprobed entries are silhouettes (their names are not even in the page). Per-section counts only, never one grand total. */
export function FieldLogPage() {
  useDocumentTitle("Field Log");
  const { user } = useAuth();
  const [sections, setSections] = useState<LogSection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [scanned, setScanned] = useState<Set<string>>(() => keysOf(scannedIds()));
  const busy = useRef(false);
  useEffect(() => { api<LogSection[]>("/api/field-log").then((d) => (Array.isArray(d) ? setSections(d) : setFailed(true))).catch(() => setFailed(true)); }, []);
  useEffect(() => { if (user) void syncScans().then(() => setScanned(keysOf(scannedIds()))); }, [user]);
  const stats = useMemo(() => (sections ?? []).map((s) => sectionStat(s, scanned)), [sections, scanned]);

  function share() { // drawn once, on demand: no per-frame work
    if (!sections || busy.current) return;
    busy.current = true;
    const { bars, titles } = shareSummary(sections, scanned);
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#0b0d12"; g.fillRect(0, 0, 1200, 630);
      g.fillStyle = "#e8e8ee"; g.font = "bold 44px sans-serif"; g.fillText("Exomusica · Field Log", 60, 90);
      bars.forEach((b, i) => {
        const y = 170 + i * 80;
        g.fillStyle = "#e8e8ee"; g.font = "26px sans-serif"; g.fillText(`${b.title}  ${b.found}/${b.total}`, 60, y);
        g.fillStyle = "#222733"; g.fillRect(60, y + 14, 700, 18);
        g.fillStyle = "#ff9d3c"; g.fillRect(60, y + 14, 7 * b.pct, 18);
      });
      g.fillStyle = "#9aa0b4"; g.font = "24px sans-serif";
      titles.forEach((t, i) => g.fillText(t.length > 28 ? t.slice(0, 27) + "…" : t, 820, 170 + i * 44));
      c.toBlob((b) => {
        busy.current = false;
        if (!b) return;
        const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "field-log.png"; a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      });
    } else busy.current = false;
  }

  if (failed) return <p className="home-dim">The log could not be read.</p>;
  if (!sections) return <Loading />;
  return (
    <div className="field-log" data-testid="field-log">
      <h1>Field Log</h1>
      <p className="home-dim">Turn on Probe mode (<kbd>I</kbd>) and scan things to fill this in. {user ? "Your scans follow your account." : "Without an account, scans stay on this device."} <Link to="/chart">Chart</Link></p>
      {sections.map((s, si) => {
        const st = stats[si];
        return (
          <section key={s.id} data-testid={`log-${s.id}`} style={{ marginBottom: "1.4rem" }}>
            <h2 style={{ marginBottom: "0.2rem" }}>{s.title} <span className="home-dim" data-testid={`log-${s.id}-count`}>{st.found}/{st.total} · {st.pct}%</span></h2>
            <div className="log-meter" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.title} scanned`}><i style={{ width: `${st.pct}%` }} /></div>
            {s.entries.length === 0 ? <p className="home-dim">Nothing here yet.</p> : (
              <ul className="log-list">
                {s.entries.map((e) => {
                  const state = entryState(e, scanned);
                  if (!state.unlocked) return <li key={e.key} className="log-locked" data-testid="log-locked" aria-label="Not yet scanned">???</li>;
                  return (
                    <li key={e.key} data-testid="log-entry">
                      <Link to={e.href}>{e.title}</Link>
                      {e.stages && <span className="log-pips" title={e.stages.map((g) => (scanned.has(g.key) ? g.label : "???")).join(" · ")} aria-label={`${state.stagesDone} of ${state.stagesTotal} parts scanned`}>{e.stages.map((g) => <i key={g.key} className={scanned.has(g.key) ? "on" : ""} />)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <p><button type="button" className="btn" onClick={share} data-testid="log-share">Save a share card (PNG)</button> <span className="home-dim">Bars and a few titles only; nothing about you.</span></p>
    </div>
  );
}
