import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLensStore } from "../lib/lensStore";
import type { Doc } from "../lib/letterDoc";
import { LetterView } from "./LetterView";
import { freqOf, showFreq, type EntityType } from "../lib/atlas";

const hash = (n: number): number => { let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
/** Where a mark's blip sits on the scope: stable per id, never in the dead centre. Percent of the scope box. */
export function blipAt(id: number): { x: number; y: number } {
  const a = (hash(id) % 3600) / 3600 * Math.PI * 2, r = 0.22 + (hash(id * 7 + 1) % 1000) / 1000 * 0.68;
  return { x: 50 + Math.cos(a) * r * 46, y: 50 + Math.sin(a) * r * 46 };
}
const daysLeft = (iso: string): number => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));
function sector(key: string): string {
  const [t, ...r] = key.split(":");
  try { return showFreq(freqOf(t as EntityType, r.join(":"))) + " MHz"; } catch { return "unknown"; }
}
const Scope = ({ blips, sel, onPick }: { blips: { id: number; mine: boolean }[]; sel: number | null; onPick: (id: number) => void }) => (
  <div className="scope" aria-label="Scope">
    <i className="scope-ring r1" /><i className="scope-ring r2" /><i className="scope-ring r3" /><i className="scope-x" /><i className="scope-sweep" />
    {blips.map((b) => { const p = blipAt(b.id); return (
      <button key={b.id} type="button" className={`blip${b.mine ? " mine" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-pressed={sel === b.id} aria-label={`Contact ${b.id}`} data-testid="landmark" onClick={() => onPick(b.id)} />
    ); })}
  </div>
);

interface Mark { id: number; doc: Doc; by: string | null; mine: boolean; at: string; expiresAt: string }

/** What the Trace lens shows: the marks people left on this place. With the lens off nothing here exists on the page at all. */
export function Landmarks({ focusKey }: { focusKey: string | null }) {
  const on = useLensStore((s) => s.on);
  const { user } = useAuth();
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = () => { if (focusKey) api<Mark[]>(`/api/landmarks?key=${encodeURIComponent(focusKey)}`).then(setMarks).catch(() => setMarks([])); };
  useEffect(() => { setMarks(null); setOpen(null); if (on) load(); }, [on, focusKey, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const setLens = useLensStore((s) => s.set);
  if (on && !focusKey) return (
    <aside className="landmarks" aria-label="Trace lens" data-testid="landmarks-nowhere">
      <p className="lm-bar"><b>LONG-RANGE SCAN</b><span className="lm-state">no sector</span></p>
      <p className="home-dim">Nothing to scan on this page. Fly to a branch, album, study or wiki page: the lens reads what other travellers left in that sector.<button type="button" className="linklike" onClick={() => setLens(false)}>Stand down</button></p>
    </aside>
  );
  if (!on || !focusKey) return null;
  async function remove(id: number) { await api(`/api/letters/${id}`, { method: "DELETE" }).catch(() => {}); load(); }
  const shown = open !== null ? marks?.find((m) => m.id === open) : null;
  return (
    <aside className="landmarks" aria-label="Marks left here" data-testid="landmarks">
      <p className="lm-bar"><b>LONG-RANGE SCAN</b><span className="lm-state">{marks === null ? "scanning" : "locked"}</span></p>
      <p className="lm-sector">sector <b>{sector(focusKey)}</b> · <b data-testid="lm-count">{marks === null ? "…" : marks.length}</b> {marks?.length === 1 ? "contact" : "contacts"}</p>
      <Scope blips={(marks ?? []).map((m) => ({ id: m.id, mine: m.mine }))} sel={open} onPick={(id) => setOpen(open === id ? null : id)} />
      {marks && marks.length === 0 && <p className="home-dim">Empty space. No traveller has passed through here yet.</p>}
      {shown ? (
        <div className="landmark-open" data-testid="landmark-open">
          <LetterView doc={shown.doc} />
          <p className="home-dim">{shown.by ? `from ${shown.by}` : "unsigned beacon"} · signal decays in {daysLeft(shown.expiresAt)} d
            {(shown.mine || user?.isAdmin) && <> · <button type="button" className="linklike" onClick={() => void remove(shown.id)}>silence it</button></>}</p>
        </div>
      ) : marks && marks.length > 0 && <p className="home-dim lm-hint">Tap a blip to open the beacon.</p>}
      <p className="lm-foot">
        {user ? <Link to={`/pms?at=${encodeURIComponent(focusKey)}`} data-testid="leave-mark">Drop a beacon</Link> : <Link to="/login">Log in to drop a beacon</Link>}
        <button type="button" className="linklike" onClick={() => setLens(false)}>Stand down</button>
      </p>
    </aside>
  );
}
