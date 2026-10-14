import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

interface MyPlaylistOption {
  id: number;
  title: string;
}

// All the buttons on a page share one lookup (a row per track would otherwise fetch the same list again and again).
let shared: { at: number; p: Promise<MyPlaylistOption[]> } | null = null;
function myPlaylists(): Promise<MyPlaylistOption[]> {
  if (!shared || Date.now() - shared.at > 20_000) shared = { at: Date.now(), p: api<MyPlaylistOption[]>("/api/playlists?mine=true").then((r) => (Array.isArray(r) ? r : [])).catch(() => { shared = null; return []; }) };
  return shared.p;
}

/**
 * One small list-icon button. Pressing it opens your playlists as buttons; pressing a playlist adds the track there.
 * (A <select> here pushed the row wider than a phone screen and made the page scroll sideways.)
 */
export function AddToPlaylistControl({ trackId, communityTrackId }: { trackId?: number; communityTrackId?: number }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<MyPlaylistOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ id: number; ok: boolean } | null>(null);
  const box = useRef<HTMLSpanElement>(null);

  // Loaded the first time the button is pressed, not for every track row on the page.
  useEffect(() => {
    if (!open || playlists !== null || !user) return;
    void myPlaylists().then(setPlaylists);
  }, [open, playlists, user]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!user) return null;

  async function add(id: number) {
    try {
      await api(`/api/playlists/${id}/items`, { method: "POST", body: JSON.stringify({ trackId, communityTrackId }) });
      setStatus({ id, ok: true });
    } catch {
      setStatus({ id, ok: false });
    }
    window.setTimeout(() => { setStatus(null); setOpen(false); }, 900);
  }

  return (
    <span ref={box} className="add-pl" data-testid="add-pl">
      <button type="button" className="btn add-pl-btn" title="Add to playlist" aria-label="Add to playlist" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="add-pl-open">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 8H20M11 12H20M14 16H20M4 8H4.01M7 12H7.01M10 16H10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <span className="add-pl-pop" role="menu" data-testid="add-pl-pop">
          {playlists === null && <span className="home-dim">…</span>}
          {playlists?.length === 0 && <span className="home-dim">No playlists yet</span>}
          {playlists?.map((p) => (
            <button key={p.id} type="button" role="menuitem" className="btn add-pl-item" onClick={() => void add(p.id)} data-testid="add-pl-item">
              {p.title}{status?.id === p.id ? (status.ok ? " ✓" : " ✗") : ""}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
