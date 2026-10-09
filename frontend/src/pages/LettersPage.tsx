import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { Doc } from "../lib/letterDoc";
import { LetterComposer } from "../components/LetterComposer";
import { LetterView } from "../components/LetterView";

interface Inbox { got: { id: number; from: string; at: string; opened: boolean }[]; sent: { id: number; to: string; state: string; deliverAt: string }[] }
interface Full { id: number; doc: Doc; from: string; at: string; mine: boolean; canBlock: boolean }

/** Letters: what came, what is on its way, and the sheet to write on. A letter is for one member, or is left on a place for whoever turns on the Trace lens there. */
export function LettersPage() {
  useDocumentTitle("Letters");
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const at = sp.get("at");
  const [tab, setTab] = useState<"in" | "write">(at || sp.get("to") ? "write" : "in");
  const [box, setBox] = useState<Inbox | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [doc, setDoc] = useState<Doc>({ bg: "paper", items: [] });
  const [to, setTo] = useState(sp.get("to") ?? "");
  const [hours, setHours] = useState(0);
  const [unsigned, setUnsigned] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<Inbox>("/api/letters/inbox").then(setBox).catch(() => setBox({ got: [], sent: [] }));
  useEffect(() => { if (user) void load(); }, [user]);

  async function openLetter(id: number) { setFull(await api<Full>(`/api/letters/${id}`).catch(() => null)); void load(); window.dispatchEvent(new Event("exomusica:letters")); }
  async function send() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/letters", { method: "POST", body: JSON.stringify(at ? { doc, at, unsigned, days: 30 } : { doc, to, hours }) });
      if (at) { nav(-1); return; }
      setMsg({ ok: true, text: hours ? `On its way. It arrives in ${hours} h.` : "Sent." }); setDoc({ bg: "paper", items: [] }); setTab("in"); void load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it" }); } finally { setBusy(false); }
  }
  if (!user) return <div className="page-column"><h1>Letters</h1><p className="home-dim"><Link to="/login">Log in</Link> to write and receive letters.</p></div>;
  return (
    <div className="letters-page page-column" style={{ maxWidth: 860 }} data-testid="letters-page">
      <h1>Letters</h1>
      <div className="xl-form-row" role="tablist">
        <button className={`btn${tab === "in" ? " btn-primary" : ""}`} role="tab" aria-selected={tab === "in"} onClick={() => setTab("in")} data-testid="tab-in">Post</button>
        <button className={`btn${tab === "write" ? " btn-primary" : ""}`} role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")} data-testid="tab-write">Write</button>
      </div>
      {msg && <p className={msg.ok ? "home-dim" : "an-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {tab === "write" ? (
        <>
          <LetterComposer onChange={setDoc} />
          <div className="comp-send" data-testid="comp-send">
            {at ? (
              <>
                <p>Leaving this on <b>{at.replace(":", " · ")}</b>. It stays for 30 days and shows only to people with the Trace lens on there.</p>
                <label><input type="checkbox" checked={unsigned} onChange={(e) => setUnsigned(e.target.checked)} /> Leave it unsigned (the team can still see who wrote it)</label>
              </>
            ) : (
              <div className="xl-form-row">
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Member's username" aria-label="To" data-testid="comp-to" style={{ flex: "1 1 160px" }} />
                <label>Slow post <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Slow post"><option value={0}>deliver now</option><option value={6}>in 6 hours</option><option value={24}>tomorrow</option><option value={72}>in 3 days</option></select></label>
              </div>
            )}
            <button className="btn btn-primary" disabled={busy || doc.items.length === 0 || (!at && !to.trim())} onClick={() => void send()} data-testid="comp-submit">{at ? "Leave it here" : "Send"}</button>
          </div>
        </>
      ) : box === null ? <p className="home-dim">Loading…</p> : (
        <>
          <h2 className="home-h2">Arrived</h2>
          {box.got.length === 0 ? <p className="home-dim">Nothing yet.</p> : <ul className="letters-list" data-testid="letters-got">{box.got.map((l) => <li key={l.id}><button className={`btn${l.opened ? "" : " btn-primary"}`} onClick={() => void openLetter(l.id)}>{l.opened ? "" : "● "}from {l.from} <span className="home-dim">{new Date(l.at).toLocaleDateString()}</span></button></li>)}</ul>}
          <h2 className="home-h2">Sent</h2>
          {box.sent.length === 0 ? <p className="home-dim">Nothing sent.</p> : <ul className="letters-list" data-testid="letters-sent">{box.sent.map((l) => <li key={l.id}><button className="btn" onClick={() => void openLetter(l.id)}>to {l.to} <span className="home-dim">{l.state}</span></button></li>)}</ul>}
        </>
      )}
      {full && (
        <div className="letter-open" data-testid="letter-open">
          <LetterView doc={full.doc} />
          <div className="xl-form-row">
            <span className="home-dim">{full.mine ? "your letter" : `from ${full.from}`}</span>
            {!full.mine && <button className="btn" onClick={() => { setTo(full.from); setTab("write"); setFull(null); }}>Write back</button>}
            <button className="btn" onClick={() => void api(`/api/letters/${full.id}`, { method: "DELETE" }).then(() => { setFull(null); void load(); })}>Delete</button>
            {full.canBlock && <button className="btn btn-danger" onClick={() => void api(`/api/letters/${full.id}/block`, { method: "POST" }).then(() => { setFull(null); void load(); })} data-testid="letter-block">Stop letters from {full.from}</button>}
            <button className="btn" onClick={() => setFull(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
