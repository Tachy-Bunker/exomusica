import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLensStore } from "../lib/lensStore";
import type { Doc } from "../lib/letterDoc";
import { LetterView } from "./LetterView";
import { freqOf, showFreq, type EntityType } from "../lib/atlas";
import { NOTE_COLORS, NOTE_MAX, noteDoc, noteText, opensLeft, pageSpot, spotOf } from "../lib/visor";

interface Mark { id: number; doc: Doc; by: string | null; mine: boolean; at: string; expiresAt: string; x?: number | null; y?: number | null }

const daysLeft = (iso: string): number => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));
function sector(key: string): string {
  const [t, ...r] = key.split(":");
  try { return showFreq(freqOf(t as EntityType, r.join(":"))) + " MHz"; } catch { return "unknown"; }
}

/** The Scan Visor. With it on the page gets a faint grid in other colors, and the notes and drawings that travellers left in this sector hang where they were left.
 *  With "Write" on, a click anywhere puts a note there. No panel in the way: the only box is a small readout at the top. Off, nothing of this exists on the page. */
export function Landmarks({ focusKey }: { focusKey: string | null }) {
  const on = useLensStore((s) => s.on);
  const setLens = useLensStore((s) => s.set);
  const { user } = useAuth();
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState<string>(NOTE_COLORS[0]);
  const [unsigned, setUnsigned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hud = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { if (focusKey) api<Mark[]>(`/api/landmarks?key=${encodeURIComponent(focusKey)}`).then((m) => setMarks(Array.isArray(m) ? m : [])).catch(() => setMarks([])); }, [focusKey]);
  useEffect(() => { setMarks(null); setOpen(null); setAt(null); setWriting(false); if (on) load(); }, [on, focusKey, user, load]);
  useEffect(() => { document.body.classList.toggle("visor-writing", on && writing && !!focusKey); return () => document.body.classList.remove("visor-writing"); }, [on, writing, focusKey]);

  // Writing: the next click anywhere on the page (not on the bar, the readout or the note box) chooses the spot.
  useEffect(() => {
    if (!on || !writing || !focusKey) return;
    function click(e: MouseEvent) {
      const t = e.target as Element | null;
      if (!t || t.closest("[data-testid=faceplate], .visor-hud, .visor-pop, .visor-beacon, .visor-card, [aria-modal=true]")) return;
      e.preventDefault(); e.stopPropagation();
      const w = document.documentElement.scrollWidth;
      const s = pageSpot(e.pageX, e.pageY, w);
      setAt({ ...s, px: e.pageX, py: e.pageY }); setText(""); setErr(null); setOpen(null);
    }
    function key(e: KeyboardEvent) { if (e.key === "Escape") { if (at) setAt(null); else setWriting(false); } }
    document.addEventListener("click", click, true); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("keydown", key); };
  }, [on, writing, focusKey, at]);
  useEffect(() => { if (at) pop.current?.querySelector("textarea")?.focus(); }, [at]);

  async function send() {
    if (!at || !focusKey || !text.trim()) return;
    try {
      await api("/api/letters", { method: "POST", body: JSON.stringify({ doc: noteDoc(text, color), at: focusKey, unsigned, days: 30, x: at.x, y: at.y }) });
      setAt(null); setText(""); load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't leave it"); }
  }
  async function remove(id: number) { await api(`/api/letters/${id}`, { method: "DELETE" }).catch(() => {}); setOpen(null); load(); }

  if (!on) return null;
  const shown = open !== null ? marks?.find((m) => m.id === open) ?? null : null;
  const hudEl = (
    <div className="visor-hud" ref={hud} data-testid={focusKey ? "landmarks" : "landmarks-nowhere"} role="region" aria-label="Scan Visor">
      <p className="visor-bar"><b>SCAN VISOR</b><span>{focusKey ? (marks === null ? "scanning" : "locked") : "no sector"}</span></p>
      {focusKey ? (
        <>
          <p className="visor-sector">sector <b>{sector(focusKey)}</b> · <b data-testid="lm-count">{marks === null ? "…" : marks.length}</b> {marks?.length === 1 ? "trace" : "traces"}</p>
          <div className="visor-tools">
            {user ? <button type="button" className="visor-btn" aria-pressed={writing} onClick={() => { setWriting((w) => !w); setAt(null); }} data-testid="visor-write">✎ Write on the page</button> : <Link className="visor-btn" to="/login">Log in to write</Link>}
            {user && <Link className="visor-btn" to={`/pms?at=${encodeURIComponent(focusKey)}`} data-testid="leave-mark" title="Draw something on a sheet instead">Draw one</Link>}
            <button type="button" className="visor-btn" onClick={() => setLens(false)} data-testid="visor-off">Off</button>
          </div>
          {writing && <p className="visor-hint">{at ? "Write it, then Enter." : "Click anywhere on the page. Esc stops."}</p>}
          {marks && marks.length === 0 && !writing && <p className="visor-hint">Empty space. Nobody has left a trace here yet.</p>}
        </>
      ) : (
        <>
          <p className="visor-hint">Nothing to scan on this page. Fly to a branch, album, study or wiki page: the visor reads what other travellers left in that sector.</p>
          <div className="visor-tools"><button type="button" className="visor-btn" onClick={() => setLens(false)}>Off</button></div>
        </>
      )}
    </div>
  );
  const layer = focusKey && (
    <div className="visor-layer" aria-label="Traces left here" data-testid="visor-layer">
      {(marks ?? []).map((m) => {
        const s = spotOf(m), words = noteText(m.doc), left = opensLeft(s.left);
        return (
          <div key={m.id} className={`visor-beacon${m.mine ? " mine" : ""}${left ? " left" : ""}${open === m.id ? " open" : ""}`} style={{ left: `${s.left}%`, top: s.top }}>
            <button type="button" className="visor-dot" aria-pressed={open === m.id} aria-label={words ? `Note: ${words}` : `Drawing${m.by ? ` by ${m.by}` : ""}`} onClick={() => { setOpen(open === m.id ? null : m.id); setAt(null); }} data-testid="landmark" />
            {words && open !== m.id && <span className="visor-label" aria-hidden="true">{words.length > 38 ? words.slice(0, 36) + "…" : words}</span>}
            {open === m.id && shown && (
              <div className="visor-card" data-testid="landmark-open">
                {words ? <p className="visor-words">{words}</p> : <LetterView doc={shown.doc} />}
                <p className="visor-meta">{shown.by ? `from ${shown.by}` : "unsigned"} · fades in {daysLeft(shown.expiresAt)} d{(shown.mine || user?.isAdmin) && <> · <button type="button" className="linklike" onClick={() => void remove(shown.id)}>erase</button></>}</p>
              </div>
            )}
          </div>
        );
      })}
      {at && (
        <div className={`visor-pop${opensLeft(at.x * 100) ? " left" : ""}`} ref={pop} style={{ left: `${at.x * 100}%`, top: at.y }} data-testid="visor-pop">
          <textarea value={text} maxLength={NOTE_MAX} rows={2} placeholder="Write here…" aria-label="Your note" data-testid="visor-note-input"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <div className="visor-pop-row">
            {NOTE_COLORS.map((c) => <button key={c} type="button" className={`visor-sw${color === c ? " on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} />)}
            <label className="visor-un"><input type="checkbox" checked={unsigned} onChange={(e) => setUnsigned(e.target.checked)} /> unsigned</label>
            <button type="button" className="visor-btn" onClick={() => setAt(null)}>Cancel</button>
            <button type="button" className="visor-btn go" disabled={!text.trim()} onClick={() => void send()} data-testid="visor-note-send">Leave it</button>
          </div>
          {err && <p className="an-err" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
  return (
    <>
      <div className="visor-grid" aria-hidden="true" data-testid="visor-grid"><i /><i /><i /><i /></div>
      {hudEl}
      {layer && createPortal(layer, document.body)}
    </>
  );
}
