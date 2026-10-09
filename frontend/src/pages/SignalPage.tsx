import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { setPendingAnalysis } from "../lib/analyzerHandoff";
import { addTried, clearTried, counts, defaultTab, filterNodes, getSeen, getTried, markSeen, sortNodes, txLabel, type Tab } from "../lib/signalUi";

interface Reward { text: string | null; url: string | null; points: number; item: { id: number; title: string } | null }
interface Node { id: number; title: string; body: string; mediaUrl: string | null; hint: string | null; hasAnswer: boolean; solved: boolean; quorum: number; solveCount: number | null; reward: Reward | null }
interface Station { today: { index: number; label: string }; nodes: Node[] }
const AUDIO = /\.(wav|flac|mp3|ogg|m4a|opus)(\?|$)/i, IMAGE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i;

function Media({ url, title }: { url: string; title: string }) {
  const nav = useNavigate();
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  async function analyze() {
    setBusy(true);
    try { const blob = await (await fetch(url)).blob(); setPendingAnalysis({ blob, name: title }); nav("/xenolab?tab=analyze"); } catch { setBusy(false); }
  }
  if (AUDIO.test(url)) return (
    <div className="sig-mediabox">
      <audio controls preload="none" src={url} className="sig-media" aria-label={`${title}: audio`} />
      <div className="sig-tools">
        <button type="button" className="btn" onClick={() => void analyze()} disabled={busy} title="Open this sound in the Analyzer: spectrogram, waveform, measurements" data-testid="sig-analyze">{busy ? "Opening…" : "Look at it in the Analyzer"}</button>
        <a className="btn" href={url} download>Download</a>
      </div>
    </div>
  );
  if (IMAGE.test(url)) return (
    <div className="sig-mediabox">
      <button type="button" className="sig-imgbtn" onClick={() => setZoom(true)} aria-label={`${title}: enlarge the picture`} data-testid="sig-img"><img src={url} alt="" className="sig-media" loading="lazy" /></button>
      <div className="sig-tools"><button type="button" className="btn" onClick={() => setZoom(true)}>Enlarge</button><a className="btn" href={url} download>Download</a></div>
      {zoom && <div className="sig-zoom" role="dialog" aria-modal="true" aria-label={title} onClick={() => setZoom(false)} data-testid="sig-zoom"><img src={url} alt="" /><button type="button" className="btn sig-zoom-x" onClick={() => setZoom(false)}>Close ×</button></div>}
    </div>
  );
  return <p><a href={url} target="_blank" rel="noreferrer">{url}</a></p>;
}

function RewardView({ r }: { r: Reward }) {
  if (!r.text && !r.url && !r.points && !r.item) return null;
  return (
    <div className="sig-reward" data-testid="sig-reward">
      {r.text && <p>{r.text}</p>}
      {r.url && <p><a href={r.url} target={r.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{r.url}</a></p>}
      {r.item && <p>Unlocked: <Link to={`/resource/${r.item.id}`}>{r.item.title}</Link></p>}
      {r.points > 0 && <p className="home-dim">+{r.points} contributor points</p>}
    </div>
  );
}

function NodeCard({ n, fresh, onSolved }: { n: Node; fresh: boolean; onSolved: () => void }) {
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState<string[]>(() => getTried(n.id));
  const ref = useRef<HTMLLIElement>(null);
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ correct: boolean }>(`/api/signal/${n.id}/answer`, { method: "POST", body: JSON.stringify({ answer }) });
      if (r.correct) { clearTried(n.id); onSolved(); }
      else { setTried(addTried(n.id, answer)); setMsg("No carrier. That is not it."); }
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "The line is dead."); } finally { setBusy(false); }
  }
  return (
    <li ref={ref} className={`sig-node${n.solved ? " got" : ""}${fresh && !n.solved ? " fresh" : ""}`} data-testid="sig-node" id={`tx-${n.id}`}>
      <div className="sig-head"><span className="sig-id">{txLabel(n.id)}</span><b>{n.title}</b>{fresh && !n.solved && <span className="sig-new" data-testid="sig-new">new</span>}{n.solved && <span className="sig-got">received</span>}</div>
      <p className="sig-body">{n.body}</p>
      {n.mediaUrl && <Media url={n.mediaUrl} title={n.title} />}
      {n.quorum > 0 && n.solveCount !== null && (
        <div className="sig-quorum" data-testid="sig-quorum">
          <div className="sig-bar" role="img" aria-label={`${n.solveCount} of ${n.quorum} have opened this`}><span style={{ width: `${Math.min(100, (n.solveCount / n.quorum) * 100)}%` }} /></div>
          <p className="home-dim">{n.solveCount >= n.quorum ? "Open. Whatever it guarded is now on the air for everyone." : `${n.solveCount} of ${n.quorum} needed. This one opens only when enough of you do it.`}</p>
        </div>
      )}
      {!n.solved && (
        <>
          <form className="xl-form-row" onSubmit={(e) => { e.preventDefault(); if (!busy && (!n.hasAnswer || answer.trim())) void submit(); }}>
            {n.hasAnswer && <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What does it say?" aria-label={`Answer for ${n.title}`} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="send" style={{ flex: "1 1 180px", minWidth: 0 }} data-testid="sig-answer" />}
            <button className="btn btn-primary" disabled={busy || (n.hasAnswer && !answer.trim())} data-testid="sig-submit">{n.hasAnswer ? "Send" : "Log reception"}</button>
            {n.hint && <button type="button" className="btn" onClick={() => setHint((v) => !v)} aria-expanded={hint}>Hint</button>}
          </form>
          {n.hasAnswer && <p className="home-dim sig-fine">Capitals, spaces and punctuation don't matter.</p>}
        </>
      )}
      {tried.length > 0 && !n.solved && (
        <p className="sig-tried" data-testid="sig-tried"><span className="home-dim">Already tried:</span> {tried.map((t) => <button type="button" key={t} className="sig-try" onClick={() => setAnswer(t)} title="Put it back in the box">{t}</button>)}</p>
      )}
      {hint && n.hint && !n.solved && <p className="home-dim" data-testid="sig-hint">{n.hint}</p>}
      {msg && <p className="an-err" role="alert" data-testid="sig-msg">{msg}</p>}
      {n.solved && n.reward && <RewardView r={n.reward} />}
    </li>
  );
}

const TAB_LABEL: Record<Tab, string> = { todo: "To decode", done: "Received", all: "All" };

/** The numbers station. Dates here are the station's own calendar; what is on the air depends on what you and everyone else have done. */
export function SignalPage() {
  useDocumentTitle("Signal");
  const { user } = useAuth();
  const [st, setSt] = useState<Station | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [seen] = useState<number[]>(() => getSeen()); // what was already on the air the last time you came: everything else is new
  const load = () => api<Station>("/api/signal").then(setSt).catch(() => setSt({ today: { index: 0, label: "—" }, nodes: [] }));
  useEffect(() => { if (user) void load(); }, [user]);
  useEffect(() => { if (st && st.nodes.length) markSeen(st.nodes.map((n) => n.id)); }, [st]);
  const nodes = useMemo(() => sortNodes(st?.nodes ?? []), [st]);
  const c = counts(nodes);
  const shownTab: Tab = tab ?? defaultTab(nodes);
  const shown = filterNodes(nodes, shownTab);
  if (!user) return <div className="page-column"><h1>Signal</h1><p className="home-dim"><Link to="/login">Log in</Link> to tune the station.</p></div>;
  return (
    <div className="signal-page page-column" style={{ maxWidth: 760 }} data-testid="signal-page">
      <h1>Signal</h1>
      <p className="sig-date" data-testid="sig-date">{st?.today.label ?? "…"}</p>
      <details className="sig-how" open={st !== null && nodes.length > 0 && seen.length === 0} data-testid="sig-how">
        <summary>How this works</summary>
        <p>The station broadcasts <b>transmissions</b>: sounds, pictures and messages with something hidden in them. Listen or look closely, work out what they say, and type it in. Capitals and punctuation don't matter. A right answer receives the transmission and may unlock a reward or put the next one on the air.</p>
        <p>The station keeps its own calendar, and some transmissions only open on certain days, or when enough members have solved another one. Sounds can be opened in the Analyzer to see their spectrogram.</p>
      </details>
      {nodes.length > 0 && (
        <div className="sig-tabs" role="tablist" aria-label="Transmissions">
          {(["todo", "done", "all"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={shownTab === t} className={`btn${shownTab === t ? " btn-primary" : ""}`} onClick={() => setTab(t)} data-testid={`sig-tab-${t}`}>
              {TAB_LABEL[t]}{t !== "all" && <span className="sig-count"> {c[t]}</span>}
            </button>
          ))}
        </div>
      )}
      {st && nodes.length === 0 && <p className="home-dim">The band is quiet. Nothing is on the air for you yet. New transmissions open when the station's calendar turns, or when other members' work unlocks them.</p>}
      {st && nodes.length > 0 && shown.length === 0 && <p className="home-dim" data-testid="sig-none">{shownTab === "todo" ? "You have decoded everything on the air. Check back when the calendar turns." : "Nothing received yet."}</p>}
      <ul className="sig-list">{shown.map((n) => <NodeCard key={n.id} n={n} fresh={seen.length > 0 && !seen.includes(n.id)} onSolved={() => void load()} />)}</ul>
    </div>
  );
}
