import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { uploadStudyFile } from "../lib/uploadAttachment";
import { useToastStore } from "../lib/toastStore";

interface Hit { kind: "track" | "community"; id: number; title: string; detail: string; hosted: boolean }

/**
 * Swap the recording a study is built around. The study's audio block and every cited clip are rewritten to point at the
 * new sound, so the markers stay at the same times. Closed by default: it costs nothing until opened.
 */
export function ReplaceAudio({ slug, url, onDone }: { slug: string; url: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits(null); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      api<Hit[]>(`/api/studies-audio-search?q=${encodeURIComponent(q.trim())}`).then((h) => alive && setHits(Array.isArray(h) ? h : [])).catch(() => alive && setHits([]));
    }, 300);
    return () => { alive = false; window.clearTimeout(id); };
  }, [q, open]);

  async function swap(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    try {
      const r = await api<{ blocks: number; clips: number }>(`/api/studies/${slug}/replace-audio`, { method: "POST", body: JSON.stringify({ from: url, ...body }) });
      useToastStore.getState().showToast(`Recording replaced · ${r.clips} marker${r.clips === 1 ? "" : "s"} kept`);
      setOpen(false); setQ(""); setHits(null);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't replace the recording.");
    } finally { setBusy(false); }
  }
  async function upload(file: File) {
    setBusy(true); setErr("");
    try {
      const newUrl = await uploadStudyFile(slug, file, file.name);
      setBusy(false);
      await swap({ uploadUrl: newUrl });
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : "Couldn't upload that file.");
    }
  }

  if (!open) return <button type="button" className="btn audio-replace-btn" onClick={() => setOpen(true)} data-testid="audio-replace-open">Replace recording</button>;
  return (
    <div className="audio-replace" ref={box} data-testid="audio-replace">
      <div className="home-dim" style={{ fontSize: "0.8rem" }}>Your markers and clip notes stay at the same times. Clip spectrogram pictures are dropped, as they show the old sound.</div>
      <label className="home-dim">Upload a new file <input type="file" accept="audio/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.flac" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} data-testid="audio-replace-file" /></label>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or search a track on Exomusica" aria-label="Search Exomusica tracks" data-testid="audio-replace-search" />
      {hits && (
        <ul className="track-hits" data-testid="audio-replace-hits">
          {hits.length === 0 && <li className="home-dim">Nothing found.</li>}
          {hits.map((h) => (
            <li key={`${h.kind}${h.id}`}>
              <button type="button" className="track-hit" disabled={busy || !h.hosted} title={h.hosted ? undefined : "Hosted outside Exomusica: upload the file instead"} onClick={() => void swap(h.kind === "track" ? { trackId: h.id } : { communityTrackId: h.id })} data-testid="audio-replace-hit"><b>{h.title}</b><span className="home-dim"> {h.detail}{h.hosted ? "" : " · external"}</span></button>
            </li>
          ))}
        </ul>
      )}
      {busy && <span className="home-dim" role="status">Working…</span>}
      {err && <p role="alert" style={{ color: "var(--accent-danger)", margin: 0, fontSize: "0.85rem" }} data-testid="audio-replace-err">{err}</p>}
      <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
