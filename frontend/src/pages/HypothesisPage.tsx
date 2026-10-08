import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { participantToken } from "../lib/participant";
import { STATUS_LABEL, STATUS_ORDER, type HypDetail, type Tally } from "../lib/hypotheses";
import { SamplePlay } from "../components/SamplePlay";
import { TallyBar } from "../components/TallyBar";

export function HypothesisPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [h, setH] = useState<HypDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [earned, setEarned] = useState(0);
  const swapped = useMemo(() => Math.random() < 0.5, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useDocumentTitle(h?.title ?? "Hypothesis");

  const load = () => api<HypDetail>(`/api/hypotheses/${id}?token=${participantToken()}`).then(setH).catch(() => setMissing(true));
  useEffect(() => { setH(null); setMissing(false); setEarned(0); void load(); }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(pick: string) {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ earned: number; tally: Tally }>(`/api/hypotheses/${id}/trials`, { method: "POST", body: JSON.stringify({ pick, swapped, note, token: participantToken() }) });
      setEarned(r.earned); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it"); } finally { setBusy(false); }
  }
  async function patch(body: Record<string, unknown>) {
    setErr(null);
    try { await api(`/api/hypotheses/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); }
  }
  async function remove() {
    if (!confirm("Delete this hypothesis and its answers?")) return;
    await api(`/api/hypotheses/${id}`, { method: "DELETE" }).catch(() => {});
    nav("/hypotheses");
  }
  if (missing) return <div className="page-column"><p>No such hypothesis. <Link to="/hypotheses">Back to the basket</Link></p></div>;
  if (!h) return <p className="home-dim page-column">Loading…</p>;
  const open = h.status === "open" || h.status === "testing";
  const first = swapped ? h.stimulusB : h.stimulusA;
  const second = swapped ? h.stimulusA : h.stimulusB;
  return (
    <div className="hyp-page page-column" style={{ maxWidth: 760 }} data-testid="hypothesis-page">
      <p className="home-dim"><Link to="/hypotheses">← Hypotheses</Link></p>
      <h1>{h.title}</h1>
      <p className="hyp-meta"><span className={`hyp-status s-${h.status}`} data-testid="hyp-status">{STATUS_LABEL[h.status] ?? h.status}</span> <span className="home-dim">by {h.author}{h.requirements.length ? ` · needs ${h.requirements.join(", ")}` : ""}</span></p>
      <blockquote className="hyp-claim-big">{h.claim}</blockquote>
      {h.statusNote && <p className="home-dim" data-testid="hyp-statusnote">{h.statusNote}</p>}
      {h.study && <p>Part of <Link to={`/study/${h.study.slug}`}>{h.study.title}</Link>.</p>}
      <h2 className="home-h2">How to test it</h2>
      <p className="hyp-protocol">{h.protocol}</p>

      {!h.mine && open && !h.isAuthor && (
        <section className="hyp-try" data-testid="hyp-try" aria-label="Your answer">
          {h.testable && first && second ? (
            <>
              <p><b>{h.question}</b></p>
              <div className="hyp-clips">
                <SamplePlay sample={{ kind: "attachment", url: first, title: "Clip 1", origin: null }} branchSlug="" />
                <SamplePlay sample={{ kind: "attachment", url: second, title: "Clip 2", origin: null }} branchSlug="" />
              </div>
              <div className="xl-form-row">
                <button className="btn btn-primary" disabled={busy} onClick={() => void answer("first")} data-testid="ans-first">Clip 1</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => void answer("second")} data-testid="ans-second">Clip 2</button>
                <button className="btn" disabled={busy} onClick={() => void answer("unsure")} data-testid="ans-unsure">Can't tell</button>
              </div>
            </>
          ) : (
            <>
              <p className="home-dim">Try it, then say how it went.</p>
              <div className="xl-form-row">
                <button className="btn btn-primary" disabled={busy} onClick={() => void answer("claim")} data-testid="ans-claim">It holds</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => void answer("other")} data-testid="ans-other">It doesn't</button>
                <button className="btn" disabled={busy} onClick={() => void answer("unsure")} data-testid="ans-unsure">Not sure</button>
              </div>
            </>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Optional: a note on what you heard (280 characters)" aria-label="Note" />
          {!user && <p className="home-dim">No account needed. <Link to="/login">Log in</Link> and answers earn contributor points.</p>}
        </section>
      )}
      {h.isAuthor && open && <p className="home-dim">You wrote this one: the answers are for everyone else.</p>}
      {h.mine && <p className="home-dim" data-testid="hyp-thanks">Thanks, answered.{earned ? ` +${earned} point.` : ""} <Link to="/hypotheses/draw" data-testid="hyp-next">Draw another</Link></p>}
      {!h.mine && !open && <p className="home-dim">This one is settled and takes no more answers.</p>}
      {err && <p className="an-err" role="alert">{err}</p>}

      {h.tally ? (
        <section aria-label="Results"><h2 className="home-h2">So far</h2><TallyBar t={h.tally} testable={h.testable} />
          {h.suggested && h.suggested !== h.status && <p className="home-dim" data-testid="hyp-suggested">The numbers point to: {STATUS_LABEL[h.suggested]}.</p>}
        </section>
      ) : <p className="home-dim">{h.n} {h.n === 1 ? "answer" : "answers"}. The split shows once you have answered, so it can't steer you.</p>}

      {h.notes.length > 0 && <ul className="hyp-notes" data-testid="hyp-notes">{h.notes.map((n, i) => <li key={i}>“{n.note}” <span className="home-dim">{n.by ?? "a participant"}</span></li>)}</ul>}

      {h.canEdit && (
        <section className="hyp-admin" data-testid="hyp-admin" aria-label="Author controls">
          <h2 className="home-h2">What it means</h2>
          <div className="xl-form-row">
            <label>Status <select value={h.status} onChange={(e) => void patch({ status: e.target.value })} data-testid="hyp-set-status">{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
            <input defaultValue={h.statusNote ?? ""} placeholder="A line on why (shown to everyone)" aria-label="Status note" onBlur={(e) => { if (e.target.value !== (h.statusNote ?? "")) void patch({ statusNote: e.target.value }); }} style={{ flex: "1 1 200px" }} />
          </div>
          <div className="xl-form-row">
            <input defaultValue={h.study?.slug ?? ""} placeholder="Link one of your studies (its slug)" aria-label="Study slug" onBlur={(e) => { if (e.target.value !== (h.study?.slug ?? "")) void patch({ studyId: e.target.value.trim() || null }); }} style={{ flex: "1 1 200px" }} />
            <button className="btn btn-danger" onClick={() => void remove()}>Delete</button>
          </div>
          <p className="home-dim">A settled test with 20 or more informative answers earns you 5 points.</p>
        </section>
      )}
    </div>
  );
}
