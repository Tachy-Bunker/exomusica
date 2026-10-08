import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { participantToken } from "../lib/participant";
import { STATUS_LABEL, STATUS_ORDER, type HypCard } from "../lib/hypotheses";

/** The basket: claims anyone can test. Draw one, answer in a tap, or put your own in. */
export function HypothesesPage() {
  useDocumentTitle("Hypotheses");
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") ?? "";
  const [rows, setRows] = useState<HypCard[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [none, setNone] = useState(false);
  useEffect(() => { api<HypCard[]>(`/api/hypotheses${status ? `?status=${status}` : ""}`).then(setRows).catch(() => setRows([])); }, [status, user]);
  const draw = async () => {
    const r = await api<{ id: number } | undefined>(`/api/hypotheses/draw?token=${participantToken()}`).catch(() => undefined);
    if (r) nav(`/hypothesis/${r.id}`); else setNone(true);
  };
  return (
    <div className="hyp-page page-column" style={{ maxWidth: 900 }} data-testid="hypotheses-page">
      <h1>Hypotheses</h1>
      <p className="home-dim">Claims about sound that a few people can check. No account is needed to answer.</p>
      <div className="xl-form-row">
        <button className="btn btn-primary" onClick={() => void draw()} data-testid="hyp-draw">Draw one</button>
        {user ? <button className="btn" onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid="hyp-add">Put one in the basket</button> : <span className="home-dim"><Link to="/login">Log in</Link> to propose one</span>}
      </div>
      {none && <p className="home-dim" role="status" data-testid="hyp-none">Nothing left to draw: you have answered everything open.</p>}
      {adding && <NewHypothesis onDone={(id) => nav(`/hypothesis/${id}`)} />}
      <div className="hyp-filters" role="group" aria-label="Status">
        {["", ...STATUS_ORDER].map((s) => <button key={s} className={`xl-chip${status === s ? " on" : ""}`} aria-pressed={status === s} onClick={() => setSp(s ? { status: s } : {})}>{s ? STATUS_LABEL[s] : "all"}</button>)}
      </div>
      {rows === null ? <p className="home-dim">Loading…</p> : rows.length === 0 ? <p className="home-dim">Nothing here yet.</p> : (
        <ul className="hyp-list">
          {rows.map((h) => (
            <li key={h.id} className="hyp-card" data-testid="hyp-card">
              <div className="hyp-head"><Link to={`/hypothesis/${h.id}`}><b>{h.title}</b></Link><span className={`hyp-status s-${h.status}`}>{STATUS_LABEL[h.status] ?? h.status}</span></div>
              <p className="hyp-claim">{h.claim}</p>
              <p className="home-dim">{h.testable ? "one-tap A/B" : "try it yourself"} · {h.n} {h.n === 1 ? "answer" : "answers"} · by {h.author}{h.answered ? " · you answered" : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewHypothesis({ onDone }: { onDone: (id: number) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const fd = new FormData(form.current!);
    for (const k of ["a", "b"]) { const f = fd.get(k); if (f instanceof File && f.size === 0) fd.delete(k); }
    try { const r = await api<{ id: number }>("/api/hypotheses", { method: "POST", body: fd }); onDone(r.id); }
    catch (x) { setErr(x instanceof Error ? x.message : "Couldn't save it"); } finally { setBusy(false); }
  }
  return (
    <form ref={form} onSubmit={submit} className="xl-form hyp-new" data-testid="hyp-form">
      <input name="title" placeholder="Short title" maxLength={120} required aria-label="Title" />
      <textarea name="claim" placeholder="The claim: one sentence a test could show wrong" rows={2} maxLength={600} required aria-label="Claim" />
      <textarea name="protocol" placeholder="How to test it: what to do or listen for, and what counts as yes" rows={4} maxLength={4000} required aria-label="Protocol" />
      <input name="requirements" placeholder="Needs (comma separated): headphones, quiet room…" aria-label="Requirements" />
      <fieldset className="hyp-ab">
        <legend className="home-dim">Optional one-tap A/B test. The claim predicts the answer is clip A. Clips are shown in random order.</legend>
        <input name="question" placeholder="The question, e.g. Which sounds brighter?" maxLength={160} aria-label="Question" />
        <div className="xl-form-row">
          <label className="xl-file"><span className="home-dim">Clip A</span><input type="file" name="a" accept="audio/*" aria-label="Clip A file" /></label>
          <input name="aLink" placeholder="…or https link" aria-label="Clip A link" />
        </div>
        <div className="xl-form-row">
          <label className="xl-file"><span className="home-dim">Clip B</span><input type="file" name="b" accept="audio/*" aria-label="Clip B file" /></label>
          <input name="bLink" placeholder="…or https link" aria-label="Clip B link" />
        </div>
      </fieldset>
      {err && <p className="an-err" role="alert">{err}</p>}
      <div className="xl-form-row"><button className="btn btn-primary" disabled={busy} data-testid="hyp-save">{busy ? "Saving…" : "Add to the basket"}</button></div>
    </form>
  );
}

/** /hypotheses/draw: straight to a random open one. */
export function HypothesisDrawPage() {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    api<{ id: number } | undefined>(`/api/hypotheses/draw?token=${participantToken()}`).then((r) => setTo(r ? `/hypothesis/${r.id}` : "/hypotheses")).catch(() => setTo("/hypotheses"));
  }, []);
  return to ? <Navigate to={to} replace /> : <p className="home-dim page-column">Drawing…</p>;
}
