import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToastStore } from "../lib/toastStore";

/** The "Create" button at the right of a Soundbay section heading: one name field, then you are taken to the new thing. */
export function CreateBox({ kind, label }: { kind: "playlist" | "album"; label: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!user) return <Link className="sb-create" to="/login" data-testid={`create-${kind}`}>+ Create</Link>;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const title = name.trim(); if (!title || busy) return;
    setBusy(true);
    try {
      if (kind === "playlist") {
        const p = await api<{ slug: string }>("/api/playlists", { method: "POST", body: JSON.stringify({ title }) });
        navigate(`/playlist/${p.slug}/list`);
      } else {
        const a = await api<{ slug?: string }>("/api/community-albums", { method: "POST", body: JSON.stringify({ title, composer: user!.username }) });
        navigate(a.slug ? `/community-album/${a.slug}` : "/my-music");
      }
      setName(""); setOpen(false);
    } catch (err) {
      useToastStore.getState().showToast(err instanceof Error ? err.message : "Couldn't create it");
    } finally { setBusy(false); }
  }
  return (
    <div className="sb-create-wrap" ref={box}>
      <button type="button" className="sb-create" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid={`create-${kind}`}>+ Create</button>
      {open && (
        <form className="sb-create-pop" onSubmit={go} data-testid={`create-${kind}-form`}>
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={label} aria-label={label} />
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>Create</button>
        </form>
      )}
    </div>
  );
}
