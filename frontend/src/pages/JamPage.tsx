import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useToastStore } from "../lib/toastStore";
import { JamEngine, renderLoop } from "../lib/jamEngine";
import { applyOp, clockOffset, LANE_NAMES, ROOTS, SCALE_LABEL, SCALE_RATIOS, STEPS, type JamOp, type JamState, type ScaleId } from "../lib/jamTheory";

const CLOSE_TEXT: Record<number, string> = { 4401: "Log in to join a jam.", 4404: "No room with that code. It may have closed after sitting empty.", 4409: "That room is full (6 people)." };
const NOTE_ROWS = 8;

function Lobby() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  async function create() {
    setErr("");
    try { const r = await api<{ code: string }>("/api/jam", { method: "POST" }); navigate(`/jam/${r.code}`); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make a room"); }
  }
  return (
    <div className="page-column" style={{ maxWidth: 560 }} data-testid="jam-lobby">
      <h1>Jam</h1>
      <p className="home-dim">A small shared loop machine: kick, hat, bass and lead on 16 steps. Up to six people edit the same pattern and hear it together. Every browser makes its own sound, so it stays light.</p>
      {!user ? <p><Link to="/login">Log in</Link> to start or join a room.</p> : (
        <>
          <button className="btn btn-primary" onClick={create} data-testid="jam-create">Start a room</button>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 4) navigate(`/jam/${code.trim().toUpperCase()}`); }} style={{ display: "flex", gap: "0.4rem", marginTop: "0.8rem" }}>
            <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 4))} placeholder="Room code" aria-label="Room code" maxLength={4} style={{ width: 120, textTransform: "uppercase" }} />
            <button className="btn" type="submit">Join</button>
          </form>
        </>
      )}
      {err && <p role="alert" style={{ color: "var(--accent-danger)" }}>{err}</p>}
    </div>
  );
}

function Room({ code }: { code: string }) {
  useDocumentTitle(`Jam ${code}`);
  const [state, setState] = useState<JamState | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [closed, setClosed] = useState("");
  const [sound, setSound] = useState(false);
  const [tempoDraft, setTempoDraft] = useState<number | null>(null);
  const stateRef = useRef<JamState | null>(null);
  const offset = useRef(0);
  const ws = useRef<WebSocket | null>(null);
  const head = useRef<HTMLDivElement>(null);
  const engine = useRef<JamEngine | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/ws/jam/${code}?token=${encodeURIComponent(getToken() ?? "")}`);
    ws.current = sock;
    const samples: { sent: number; got: number; server: number }[] = [];
    let sent = 0;
    const ping = () => { sent = Date.now(); sock.send(JSON.stringify({ type: "ping" })); };
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "state") { setState(m.state); setMembers(m.members); offset.current = m.now - Date.now(); ping(); }
      else if (m.type === "pong") { samples.push({ sent, got: Date.now(), server: m.now }); offset.current = clockOffset(samples); if (samples.length < 4) ping(); }
      else if (m.type === "members") setMembers(m.members);
      else if (m.type === "op") setState((s) => (s ? { ...applyOp(s, m.op as JamOp, 0), ...(m.op.t === "tempo" ? { epoch: m.epoch } : {}) } : s));
    };
    sock.onclose = (ev) => setClosed(CLOSE_TEXT[ev.code] ?? "Disconnected from the room.");
    return () => { sock.onclose = null; sock.close(); };
  }, [code]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  useEffect(() => {
    const e = new JamEngine(() => stateRef.current, serverNow, (col, delay) => {
      window.setTimeout(() => { if (head.current) head.current.style.transform = `translateX(calc(${col} * var(--cell)))`; }, delay);
    });
    engine.current = e;
    return () => { e.dispose(); engine.current = null; };
  }, [serverNow]);

  const send = useCallback((op: JamOp) => {
    if (ws.current?.readyState !== 1) return;
    ws.current.send(JSON.stringify({ op }));
    setState((s) => (s ? applyOp(s, op, serverNow()) : s)); // shown at once; the room's echo settles it
  }, [serverNow]);

  function toggleSound() {
    const e = engine.current; if (!e) return;
    if (e.running) { e.stop(); setSound(false); } else { e.start(); setSound(true); }
  }
  async function save() {
    if (!state) return;
    const wav = await renderLoop(state, 2);
    const url = URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }));
    const a = document.createElement("a"); a.href = url; a.download = `jam-${code}-${state.tempo}bpm.wav`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${location.origin}/jam/${code}`); useToastStore.getState().showToast("Invite link copied"); } catch { useToastStore.getState().showToast(`Room code: ${code}`); }
  }

  const rootLabel = useMemo(() => ROOTS.find((r) => r.hz === state?.root)?.label ?? "", [state?.root]);
  if (closed) return <div className="page-column"><p role="alert" data-testid="jam-closed">{closed}</p><Link to="/jam">Back to Jam</Link></div>;
  if (!state) return <div className="page-column"><p className="home-dim">Joining…</p></div>;

  const cols = Array.from({ length: STEPS }, (_, i) => i);
  const rowsOf = (lane: number) => (lane >= 2 ? Array.from({ length: NOTE_ROWS }, (_, k) => NOTE_ROWS - k) : [1]); // highest note on top
  const noteName = (d: number) => { const n = SCALE_RATIOS[state.scale].length; return `${d > n ? "↑" : ""}${((d - 1) % n) + 1}`; };

  return (
    <div className="page-column jam-room" style={{ maxWidth: 780 }} data-testid="jam-room">
      <div className="jam-top">
        <h1 style={{ margin: 0 }}>Jam <span className="mono" data-testid="jam-code">{code}</span></h1>
        <button className="btn" onClick={copyLink}>Copy invite</button>
        <span className="home-dim" data-testid="jam-members">{members.join(", ")}</span>
      </div>
      <div className="jam-controls">
        <button className={`btn${sound ? "" : " btn-primary"}`} onClick={toggleSound} data-testid="jam-sound">{sound ? "Stop sound" : "Start sound"}</button>
        <label>Tempo <b data-testid="jam-tempo-val">{tempoDraft ?? state.tempo}</b>
          <input type="range" min={50} max={200} value={tempoDraft ?? state.tempo} aria-label="Tempo" data-testid="jam-tempo"
            onChange={(e) => setTempoDraft(Number(e.target.value))}
            onPointerUp={() => { if (tempoDraft !== null) { send({ t: "tempo", v: tempoDraft }); setTempoDraft(null); } }}
            onKeyUp={() => { if (tempoDraft !== null) { send({ t: "tempo", v: tempoDraft }); setTempoDraft(null); } }} />
        </label>
        <label>Key <select value={state.root} aria-label="Key" onChange={(e) => send({ t: "root", v: Number(e.target.value) })}>{ROOTS.map((r) => <option key={r.hz} value={r.hz}>{r.label}</option>)}</select></label>
        <label>Scale <select value={state.scale} aria-label="Scale" data-testid="jam-scale" onChange={(e) => send({ t: "scale", v: e.target.value as ScaleId })}>{(Object.keys(SCALE_LABEL) as ScaleId[]).map((s) => <option key={s} value={s}>{SCALE_LABEL[s]}</option>)}</select></label>
        <label>Swing <input type="range" min={0} max={0.6} step={0.05} value={state.swing} aria-label="Swing" onChange={(e) => send({ t: "swing", v: Number(e.target.value) })} /></label>
        <button className="btn" onClick={save} data-testid="jam-save" title="Render two loops to a WAV file">Save loop (WAV)</button>
      </div>

      <div className="jam-grid" style={{ ["--cell" as string]: "var(--jam-cell)" }} data-testid="jam-grid">
        <div className="jam-head" ref={head} aria-hidden="true" />
        {LANE_NAMES.map((name, lane) => (
          <div key={name} className={`jam-lane${state.muted[lane] ? " muted" : ""}`} data-lane={lane}>
            <div className="jam-lane-tools">
              <b>{name}</b>
              <button className="btn" onClick={() => send({ t: "mute", lane, v: !state.muted[lane] })} aria-pressed={state.muted[lane]} title="Mute" data-testid={`jam-mute-${lane}`}>{state.muted[lane] ? "muted" : "M"}</button>
              <button className="btn" onClick={() => send({ t: "clear", lane })} title="Clear this lane">✕</button>
            </div>
            <div className="jam-rows">
              {rowsOf(lane).map((deg) => (
                <div key={deg} className="jam-row">
                  <span className="jam-deg">{lane >= 2 ? noteName(deg) : ""}</span>
                  {cols.map((c) => {
                    const v = state.steps[lane][c], on = lane < 2 ? v === 1 : v === deg;
                    return <button key={c} className={`jam-cell${on ? " on" : ""}${c % 4 === 0 ? " beat" : ""}`} aria-label={`${name} step ${c + 1}${lane >= 2 ? ` note ${deg}` : ""}`} aria-pressed={on} data-testid={on ? "jam-on" : undefined}
                      onClick={() => send({ t: "step", lane, step: c, v: lane < 2 ? (on ? 0 : 1) : on ? 0 : deg })} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="home-dim" style={{ fontSize: "0.8rem" }}>Key {rootLabel} · numbers are scale degrees (↑ = next octave). Edits are shared instantly; the beat is kept in step across everyone's clocks.</p>
    </div>
  );
}

export function JamPage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  useDocumentTitle("Jam");
  if (!code) return <Lobby />;
  if (!user) return <div className="page-column"><p>You need to <Link to="/login">log in</Link> to join a jam.</p></div>;
  return <Room code={code.toUpperCase()} />;
}
