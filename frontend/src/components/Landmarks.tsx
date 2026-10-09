import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLensStore } from "../lib/lensStore";
import type { Doc } from "../lib/letterDoc";
import { LetterView } from "./LetterView";

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
      <p className="landmarks-head"><b>Trace lens is on</b><button type="button" className="linklike" onClick={() => setLens(false)}>Turn off</button></p>
      <p className="home-dim">This page can't hold marks. Open a branch, album, study or wiki page to see what people left there.</p>
    </aside>
  );
  if (!on || !focusKey) return null;
  async function remove(id: number) { await api(`/api/letters/${id}`, { method: "DELETE" }).catch(() => {}); load(); }
  const shown = open !== null ? marks?.find((m) => m.id === open) : null;
  return (
    <aside className="landmarks" aria-label="Marks left here" data-testid="landmarks">
      <p className="landmarks-head"><b>{marks === null ? "…" : marks.length}</b> {marks?.length === 1 ? "mark" : "marks"} here
        {user ? <Link to={`/letters?at=${encodeURIComponent(focusKey)}`} data-testid="leave-mark">Leave one</Link> : <Link to="/login">Log in to leave one</Link>}</p>
      <p className="home-dim landmarks-what">Marks are small drawings or notes members leave on a place. They fade after a while.<button type="button" className="linklike" onClick={() => setLens(false)}>Turn lens off</button></p>
      {marks && marks.length === 0 && <p className="home-dim">Nobody has left anything here yet.</p>}
      {marks && marks.length > 0 && (
        <ul className="landmarks-list">
          {marks.map((m) => (
            <li key={m.id}><button type="button" className="landmark-thumb" onClick={() => setOpen(open === m.id ? null : m.id)} aria-pressed={open === m.id} aria-label={`Mark${m.by ? ` by ${m.by}` : ""}`} data-testid="landmark"><LetterView doc={m.doc} /></button></li>
          ))}
        </ul>
      )}
      {shown && (
        <div className="landmark-open" data-testid="landmark-open">
          <LetterView doc={shown.doc} />
          <p className="home-dim">{shown.by ? `from ${shown.by}` : "unsigned"} · fades {new Date(shown.expiresAt).toLocaleDateString()}
            {(shown.mine || user?.isAdmin) && <> · <button type="button" className="linklike" onClick={() => void remove(shown.id)}>remove</button></>}</p>
        </div>
      )}
    </aside>
  );
}
