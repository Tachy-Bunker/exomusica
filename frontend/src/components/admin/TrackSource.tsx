import { useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";

interface TrackHit { source: "album" | "upload" | "community"; title: string; fileUrl: string; format: string; durationSeconds: number | null; detail: string }
export interface PickedTrack { title: string; fileUrl: string; format: string }

/**
 * Two ways to get a track's file without typing an address: search what is already on this server (other albums' tracks, uploaded files,
 * community tracks), or upload a file from your own computer (for when an outside host such as Archive.org doesn't work).
 */
export function TrackSource({ onPick }: { onPick: (t: PickedTrack) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TrackHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      api<TrackHit[]>(`/api/admin/track-search?q=${encodeURIComponent(q.trim())}`).then((h) => alive && setHits(h)).catch(() => alive && setHits([]));
    }, 300);
    return () => { alive = false; window.clearTimeout(id); };
  }, [q]);

  function choose(h: TrackHit) {
    onPick({ title: h.title, fileUrl: h.fileUrl, format: h.format });
    setMsg({ kind: "ok", text: `Using “${h.title}”. Check the title, then press Add track.` });
    setHits(null);
    setQ("");
  }
  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/track-upload", { method: "POST", body: form, headers: getToken() ? { authorization: `Bearer ${getToken()}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't upload that file.");
      onPick({ title: body.title, fileUrl: body.url, format: body.format });
      const tagBits = [body.artist, body.album, body.trackNo ? `track ${body.trackNo}` : null, body.year].filter(Boolean).join(" · ");
      setMsg({ kind: "ok", text: `Uploaded${tagBits ? ` · tags: ${tagBits}` : ""}${body.durationSeconds ? ` (${Math.floor(body.durationSeconds / 60)}:${String(body.durationSeconds % 60).padStart(2, "0")})` : ""}. Check the title, then press Add track.` });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't upload that file." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="track-source" data-testid="track-source">
      <div className="field">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a track already on the server…" aria-label="Search tracks already on the server" data-testid="track-search" />
        {hits && (
          <ul className="track-hits" data-testid="track-hits">
            {hits.length === 0 && <li className="home-dim">Nothing found.</li>}
            {hits.map((h) => (
              <li key={h.fileUrl}><button type="button" className="track-hit" onClick={() => choose(h)} data-testid="track-hit"><b>{h.title}</b><span className="home-dim"> {h.format} · {h.detail}</span></button></li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <label className="home-dim">Or upload a file from your computer <input type="file" accept="audio/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.flac" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} data-testid="track-upload" /></label>
        {busy && <span className="home-dim" role="status"> Uploading…</span>}
      </div>
      {msg && <p role="status" data-testid="track-source-msg" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: msg.kind === "ok" ? "#6fd3a6" : "var(--accent-danger)" }}>{msg.text}</p>}
    </div>
  );
}
