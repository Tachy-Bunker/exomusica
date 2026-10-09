import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface Reward { text: string | null; url: string | null; points: number; item: { id: number; title: string } | null }
interface Node { id: number; title: string; body: string; mediaUrl: string | null; hint: string | null; hasAnswer: boolean; solved: boolean; quorum: number; solveCount: number | null; reward: Reward | null }
interface Station { today: { index: number; label: string }; nodes: Node[] }
const AUDIO = /\.(wav|flac|mp3|ogg|m4a|opus)(\?|$)/i, IMAGE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i;

function Media({ url }: { url: string }) {
  if (AUDIO.test(url)) return <audio controls preload="none" src={url} className="sig-media" aria-label="Transmission audio" />;
  if (IMAGE.test(url)) return <img src={url} alt="" className="sig-media" loading="lazy" />;
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

function NodeCard({ n, onSolved }: { n: Node; onSolved: () => void }) {
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ correct: boolean }>(`/api/signal/${n.id}/answer`, { method: "POST", body: JSON.stringify({ answer }) });
      if (r.correct) onSolved(); else setMsg("No carrier. That is not it.");
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "The line is dead."); } finally { setBusy(false); }
  }
  return (
    <li className={`sig-node${n.solved ? " got" : ""}`} data-testid="sig-node">
      <div className="sig-head"><b>{n.title}</b>{n.solved && <span className="sig-got">received</span>}</div>
      <p className="sig-body">{n.body}</p>
      {n.mediaUrl && <Media url={n.mediaUrl} />}
      {n.quorum > 0 && n.solveCount !== null && (
        <div className="sig-quorum" data-testid="sig-quorum">
          <div className="sig-bar" role="img" aria-label={`${n.solveCount} of ${n.quorum} have opened this`}><span style={{ width: `${Math.min(100, (n.solveCount / n.quorum) * 100)}%` }} /></div>
          <p className="home-dim">{n.solveCount >= n.quorum ? "Open. Whatever it guarded is now on the air for everyone." : `${n.solveCount} of ${n.quorum} needed. This one opens only when enough of you do it.`}</p>
        </div>
      )}
      {!n.solved && (
        <form className="xl-form-row" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {n.hasAnswer && <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label={`Answer for ${n.title}`} autoComplete="off" spellCheck={false} style={{ flex: "1 1 180px", minWidth: 0 }} data-testid="sig-answer" />}
          <button className="btn btn-primary" disabled={busy || (n.hasAnswer && !answer.trim())} data-testid="sig-submit">{n.hasAnswer ? "Send" : "Log reception"}</button>
          {n.hint && <button type="button" className="btn" onClick={() => setHint((v) => !v)} aria-expanded={hint}>Hint</button>}
        </form>
      )}
      {hint && n.hint && !n.solved && <p className="home-dim" data-testid="sig-hint">{n.hint}</p>}
      {msg && <p className="an-err" role="alert" data-testid="sig-msg">{msg}</p>}
      {n.solved && n.reward && <RewardView r={n.reward} />}
    </li>
  );
}

/** The numbers station. Dates here are the station's own calendar; what is on the air depends on what you and everyone else have done. */
export function SignalPage() {
  useDocumentTitle("Signal");
  const { user } = useAuth();
  const [st, setSt] = useState<Station | null>(null);
  const load = () => api<Station>("/api/signal").then(setSt).catch(() => setSt({ today: { index: 0, label: "—" }, nodes: [] }));
  useEffect(() => { if (user) void load(); }, [user]);
  if (!user) return <div className="page-column"><h1>Signal</h1><p className="home-dim"><Link to="/login">Log in</Link> to tune the station.</p></div>;
  return (
    <div className="signal-page page-column" style={{ maxWidth: 760 }} data-testid="signal-page">
      <h1>Signal</h1>
      <p className="sig-date" data-testid="sig-date">{st?.today.label ?? "…"}</p>
      {st && st.nodes.length === 0 && <p className="home-dim">The band is quiet. Nothing is on the air for you yet. Come back when the calendar turns.</p>}
      <ul className="sig-list">{st?.nodes.map((n) => <NodeCard key={n.id} n={n} onSolved={() => void load()} />)}</ul>
    </div>
  );
}
