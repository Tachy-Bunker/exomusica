import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useToastStore } from "../lib/toastStore";
import { JamEngine, renderLoop } from "../lib/jamEngine";
import type { ChatLine } from "../lib/jamTheory";
import { applyOp, clockOffset, LANE_NAMES, ROOTS, SCALE_LABEL, SCALE_RATIOS, STEPS, type JamOp, type JamState, type ScaleId } from "../lib/jamTheory";

const CLOSE_TEXT: Record<number, string> = { 4404: "No room with that code. It may have closed after sitting empty.", 4409: "That room is full (6 people)." };
const NOTE_ROWS = 8;

interface OpenRoom { code: string; people: number; tempo: number; full: boolean }

function Lobby() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [listed, setListed] = useState(true);
  const [open, setOpen] = useState<OpenRoom[]>([]);
  // The open list: rooms with people in them. Refreshed every few seconds while this page is visible.
  useEffect(() => {
    let live = true;
    const load = () => { if (document.visibilityState === "visible") api<OpenRoom[]>("/api/jam/rooms").then((r) => live && setOpen(Array.isArray(r) ? r : [])).catch(() => {}); };
    load();
    const id = window.setInterval(load, 8000);
    return () => { live = false; window.clearInterval(id); };
  }, []);
  async function create() {
    setErr("");
    try { const r = await api<{ code: string }>("/api/jam", { method: "POST", body: JSON.stringify({ listed }) }); navigate(`/jam/${r.code}`); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make a room"); }
  }
  return (
    <div className="page-column" style={{ maxWidth: 560 }} data-testid="jam-lobby">
      <h1>Jam</h1>
      <p className="home-dim">A small shared loop machine: kick, hat, bass and lead on 16 steps. Up to six people edit the same pattern and hear it together. Rooms are open to everyone, guests too. Every browser makes its own sound, so it stays light.</p>
      <section data-testid="jam-open">
        <h2 style={{ fontSize: "1rem" }}>Open rooms</h2>
        {open.length === 0 ? <p className="home-dim" data-testid="jam-open-empty">Nobody is jamming right now.</p> : (
          <ul className="jam-open-list">
            {open.map((r) => (
              <li key={r.code}><Link to={`/jam/${r.code}`} className={r.full ? "jam-open-full" : undefined} data-testid="jam-open-room"><b className="mono">{r.code}</b> · {r.people}/6 · {r.tempo} bpm{r.full ? " · full" : ""}</Link></li>
            ))}
          </ul>
        )}
      </section>
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 4) navigate(`/jam/${code.trim().toUpperCase()}`); }} style={{ display: "flex", gap: "0.4rem", marginTop: "0.8rem" }}>
        <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 4))} placeholder="Room code" aria-label="Room code" maxLength={4} style={{ width: 120, textTransform: "uppercase" }} />
        <button className="btn" type="submit">Join</button>
      </form>
      {user ? (
        <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={create} data-testid="jam-create">Start a room</button>
          <label className="home-dim"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} data-testid="jam-listed" /> Show it in the open list</label>
        </div>
      ) : <p className="home-dim" style={{ marginTop: "0.8rem" }}><Link to="/login">Log in</Link> to start a room of your own. Joining needs no account.</p>}
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
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [you, setYou] = useState("");
  const [guest, setGuest] = useState(false);
  const roomEl = useRef<HTMLDivElement>(null);
  const cursorLayer = useRef<HTMLDivElement>(null);
  const cursors = useRef(new Map<string, { el: HTMLDivElement; timer: number }>());
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
      if (m.type === "state") { setState(m.state); setMembers(m.members); setChat(m.chat ?? []); setYou(m.you ?? ""); setGuest(!!m.guest); offset.current = m.now - Date.now(); ping(); }
      else if (m.type === "chat") setChat((c) => [...c.slice(-39), m.line]);
      else if (m.type === "cur") moveCursor(m.u, m.x, m.y);
      else if (m.type === "gone") dropCursor(m.u);
      else if (m.type === "pong") { samples.push({ sent, got: Date.now(), server: m.now }); offset.current = clockOffset(samples); if (samples.length < 4) ping(); }
      else if (m.type === "members") setMembers(m.members);
      else if (m.type === "op") setState((s) => (s ? { ...applyOp(s, m.op as JamOp, 0), ...(m.op.t === "tempo" ? { epoch: m.epoch } : {}) } : s));
    };
    sock.onclose = (ev) => setClosed(CLOSE_TEXT[ev.code] ?? "Disconnected from the room.");
    return () => { sock.onclose = null; sock.close(); };
  }, [code]);

  // Other people's pointers: drawn straight into the DOM (a transform per message), so a busy room never re-renders React.
  function moveCursor(u: string, x: number, y: number) {
    const layer = cursorLayer.current; if (!layer) return;
    let c = cursors.current.get(u);
    if (!c) {
      const el = document.createElement("div");
      el.className = "jam-cursor"; el.style.setProperty("--hue", String(hueOf(u)));
      el.innerHTML = '<span class="jam-cursor-glyph">✦</span><span class="jam-cursor-name"></span>';
      (el.lastChild as HTMLElement).textContent = u;
      layer.appendChild(el);
      c = { el, timer: 0 }; cursors.current.set(u, c);
    }
    c.el.style.transform = `translate(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%)`;
    c.el.classList.remove("idle");
    window.clearTimeout(c.timer);
    c.timer = window.setTimeout(() => c!.el.classList.add("idle"), 4000);
  }
  function dropCursor(u: string) {
    const c = cursors.current.get(u); if (!c) return;
    window.clearTimeout(c.timer); c.el.remove(); cursors.current.delete(u);
  }
  useEffect(() => () => { for (const c of cursors.current.values()) window.clearTimeout(c.timer); cursors.current.clear(); }, []);

  // Sending mine: desktop with a mouse only, at most ~20 a second, and only while someone else is in the room.
  const membersRef = useRef<string[]>([]); membersRef.current = members;
  useEffect(() => {
    const el = roomEl.current; if (!el || !window.matchMedia("(min-width: 900px) and (pointer: fine)").matches) return;
    let last = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 50 || membersRef.current.length < 2 || ws.current?.readyState !== 1) return;
      last = now;
      const r = el.getBoundingClientRect();
      ws.current.send(JSON.stringify({ type: "cur", x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }));
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => el.removeEventListener("pointermove", onMove);
  }, [state === null]);

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
  function say(text: string) { if (ws.current?.readyState === 1 && text.trim()) ws.current.send(JSON.stringify({ type: "chat", text })); }
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
    <div className="jam-wrap">
    <div className="page-column jam-room" ref={roomEl} style={{ maxWidth: 780 }} data-testid="jam-room">
      <div className="jam-cursors" ref={cursorLayer} aria-hidden="true" data-testid="jam-cursors" />
      <div className="jam-top">
        <h1 style={{ margin: 0 }}>Jam <span className="mono" data-testid="jam-code">{code}</span></h1>
        <button className="btn" onClick={copyLink}>Copy invite</button>
        <span className="home-dim" data-testid="jam-members">{members.join(", ")}</span>
        {guest && <span className="home-dim" data-testid="jam-guest-note">You are {you}. <Link to="/join">Join</Link> to keep a name.</span>}
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
    <JamChat lines={chat} you={you} onSend={say} />
    </div>
  );
}

function hueOf(name: string): number { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }

function JamChat({ lines, you, onSend }: { lines: ChatLine[]; you: string; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);
  return (
    <aside className="jam-chat" data-testid="jam-chat" aria-label="Room chat">
      <b>Room chat</b>
      <ul ref={list} className="jam-chat-lines" data-testid="jam-chat-lines">
        {lines.length === 0 && <li className="home-dim">Say something to the room.</li>}
        {lines.map((l, i) => <li key={`${l.at}-${i}`} className={l.by === you ? "me" : undefined}><span className="jam-chat-by" style={{ ["--hue" as string]: hueOf(l.by) }}>{l.by}</span> {l.text}</li>)}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); onSend(text); setText(""); }} className="jam-chat-form">
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="Message" aria-label="Chat message" data-testid="jam-chat-input" maxLength={300} />
        <button className="btn" type="submit">Send</button>
      </form>
    </aside>
  );
}

export function JamPage() {
  const { code } = useParams<{ code: string }>();
  useDocumentTitle("Jam");
  if (!code) return <Lobby />;
  return <Room code={code.toUpperCase()} />;
}
