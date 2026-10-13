import { useState } from "react";
import { api } from "../lib/api";
import { useToastStore } from "../lib/toastStore";
import { uploadNewVersion, type TrackVersions as Versions } from "../lib/trackVersions";
import { formatTime } from "../lib/clips";

/** Earlier versions of a community track, each playable, with the comment it answered. The owner can add a version and remove old ones. */
export function TrackVersions({ trackId, data, isOwner, onChanged }: { trackId: number; data: Versions; isOwner: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (data.revisions.length === 0 && !isOwner) return null;
  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { await uploadNewVersion(trackId, file); useToastStore.getState().showToast("New version saved. Reload the track to hear it."); onChanged(); }
    catch { useToastStore.getState().showToast("Couldn't upload that"); } finally { setBusy(false); }
  }
  async function drop(id: number) {
    await api(`/api/community-tracks/${trackId}/revisions/${id}`, { method: "DELETE" }).catch(() => undefined);
    onChanged();
  }
  return (
    <div className="versions" onClick={(e) => e.stopPropagation()} data-testid="track-versions">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="versions-toggle">Versions ({data.revisions.length} earlier)</button>
      {open && (
        <div className="versions-body">
          {data.revisions.length === 0 && <p className="home-dim">No earlier versions yet.</p>}
          <ul>
            {data.revisions.map((r, i) => (
              <li key={r.id} data-testid="version-item">
                <span className="home-dim">v{data.revisions.length - i} · {new Date(r.at).toLocaleDateString()}</span>
                {r.answers && <span className="versions-answer"> answered {r.answers.user} at {formatTime(r.answers.atSeconds)}: “{r.answers.body}”</span>}
                {r.url && <audio controls preload="none" src={r.url} />}
                {isOwner && <button type="button" className="btn" onClick={() => void drop(r.id)} aria-label="Delete this version">✕</button>}
              </li>
            ))}
          </ul>
          {isOwner && <label className="btn">{busy ? "Uploading…" : "Upload a new version"}<input type="file" accept="audio/*" hidden disabled={busy} onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ""; }} data-testid="version-upload" /></label>}
        </div>
      )}
    </div>
  );
}
