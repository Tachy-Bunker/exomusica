import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { MailIcon } from "./Icons";
import { useToastStore } from "../lib/toastStore";

/** A small mail icon next to a name: opens a one-line box, Enter sends a private message without leaving the page. */
export function DmButton({ username }: { username: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (!user || user.username === username) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      await api(`/api/pms/${encodeURIComponent(username)}`, { method: "POST", body: JSON.stringify({ contentRaw: text.trim() }) });
      useToastStore.getState().showToast(`Sent to ${username}`);
      setText(""); setOpen(false);
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Couldn't send"); } finally { setBusy(false); }
  }
  return (
    <span className="dm" ref={box} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="dm-btn" onClick={() => setOpen((v) => !v)} aria-label={`Message ${username}`} aria-expanded={open} title={`Message ${username}`} data-testid="dm-btn"><MailIcon size={14} /></button>
      {open && (
        <form className="dm-pop" onSubmit={send} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} data-testid="dm-pop">
          <input autoFocus value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={`Message ${username}…`} aria-label={`Message to ${username}`} data-testid="dm-input" />
          <button className="btn btn-primary" disabled={!text.trim() || busy}>Send</button>
          <Link className="home-dim dm-open" to={`/pms/${encodeURIComponent(username)}`} title="Open the whole conversation">↗</Link>
          {err && <span className="an-err" role="alert">{err}</span>}
        </form>
      )}
    </span>
  );
}
