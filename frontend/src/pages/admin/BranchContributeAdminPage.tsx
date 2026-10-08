import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useToastStore } from "../../lib/toastStore";

interface BranchDetail {
  id: number;
  name: string;
  briefMarkdown: string | null;
  previewAttachmentId: number | null;
  sampleTrackId?: number | null;
  sampleCommunityTrackId?: number | null;
  contributeBackgroundUrl: string | null;
  contributeBackgroundOpacity: number;
}
interface Hit { source: "album" | "upload" | "community"; trackId?: number; communityTrackId?: number; attachmentId?: number; title: string; detail: string }
interface Sketch {
  id: number;
  attachment: { id: number; filename: string; storagePath: string; mimeType: string };
}
interface ChannelAttachment {
  id: number;
  filename: string;
  storagePath: string;
  mimeType: string;
  createdAt: string;
}

export function BranchContributeAdminPage() {
  const { id } = useParams<{ id: string }>();
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [briefDraft, setBriefDraft] = useState("");
  const [bgUrlDraft, setBgUrlDraft] = useState("");
  const [bgOpacityDraft, setBgOpacityDraft] = useState(0.3);
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [hitQuery, setHitQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [channelAttachments, setChannelAttachments] = useState<ChannelAttachment[] | null>(null);
  useDocumentTitle(branch ? `${branch.name} - Contribution settings` : "Contribution settings");

  function load() {
    if (!id) return;
    api<BranchDetail[]>("/api/admin/branches").then((data) => {
      const match = data.find((b) => b.id === Number(id));
      if (match) {
        setBranch(match);
        setBriefDraft(match.briefMarkdown ?? "");
        setBgUrlDraft(match.contributeBackgroundUrl ?? "");
        setBgOpacityDraft(match.contributeBackgroundOpacity);
      }
    });
    api<Sketch[]>(`/api/admin/branches/${id}/sketches`).then(setSketches);
  }
  useEffect(load, [id]);

  async function saveBrief() {
    await api(`/api/admin/branches/${id}`, { method: "PATCH", body: JSON.stringify({ briefMarkdown: briefDraft || null }) });
    useToastStore.getState().showToast("Brief saved ✓");
    load();
  }

  async function saveBackground() {
    await api(`/api/admin/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ contributeBackgroundUrl: bgUrlDraft || null, contributeBackgroundOpacity: bgOpacityDraft }),
    });
    useToastStore.getState().showToast("Background saved ✓");
    load();
  }

  // One sample per branch: choosing any kind clears the others.
  async function setSample(pick: { sampleTrackId?: number; sampleCommunityTrackId?: number; previewAttachmentId?: number } | null) {
    await api(`/api/admin/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ sampleTrackId: pick?.sampleTrackId ?? null, sampleCommunityTrackId: pick?.sampleCommunityTrackId ?? null, previewAttachmentId: pick?.previewAttachmentId ?? null }),
    });
    useToastStore.getState().showToast(pick ? "Sample set ✓" : "Sample cleared");
    load();
  }
  const setPreview = (attachmentId: number | null) => setSample(attachmentId ? { previewAttachmentId: attachmentId } : null);
  async function searchHits() {
    if (hitQuery.trim().length < 2) return;
    setHits(await api<Hit[]>(`/api/admin/track-search?q=${encodeURIComponent(hitQuery.trim())}`));
  }

  async function loadChannelAttachments() {
    const data = await api<ChannelAttachment[]>(`/api/admin/branches/${id}/channel-attachments`);
    setChannelAttachments(data);
  }

  async function addSketch(attachmentId: number) {
    await api(`/api/admin/branches/${id}/sketches`, { method: "POST", body: JSON.stringify({ attachmentId }) });
    useToastStore.getState().showToast("Added as sketch ✓");
    load();
  }

  async function removeSketch(sketchId: number) {
    await api(`/api/admin/branch-sketches/${sketchId}`, { method: "DELETE" });
    load();
  }

  if (!branch) return <p>Loading...</p>;

  return (
    <div>
      <p>
        <Link to="/admin/branches">← Branches</Link>
      </p>
      <h1>{branch.name} - Contribution settings</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        What a contributor sees on "Choose your next project" for this branch.
      </p>

      <h2 style={{ fontSize: "1rem" }}>Brief</h2>
      <textarea value={briefDraft} onChange={(e) => setBriefDraft(e.target.value)} rows={12} style={{ width: "100%", fontFamily: "var(--font-mono)" }} />
      <button className="btn btn-primary" onClick={saveBrief} style={{ marginTop: "0.4rem" }}>
        Save brief
      </button>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Card background image</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Shown behind the card on "Choose your next project", at the opacity below.</p>
      <input value={bgUrlDraft} onChange={(e) => setBgUrlDraft(e.target.value)} placeholder="Image URL" style={{ width: "100%" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem" }}>
        <label style={{ fontSize: "0.8rem" }}>Opacity</label>
        <input type="range" min={0} max={1} step={0.05} value={bgOpacityDraft} onChange={(e) => setBgOpacityDraft(Number(e.target.value))} />
        <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{bgOpacityDraft.toFixed(2)}</span>
      </div>
      <button className="btn btn-primary" onClick={saveBackground} style={{ marginTop: "0.4rem" }}>
        Save background
      </button>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Sample</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Any track on the website (album or community), or a file from a chat. Contributors hear it with a Play button, and the player names where it came from.</p>
      {branch.sampleTrackId || branch.sampleCommunityTrackId || branch.previewAttachmentId ? (
        <p style={{ fontSize: "0.85rem" }}>
          {branch.sampleTrackId ? `Site track #${branch.sampleTrackId}` : branch.sampleCommunityTrackId ? `Community track #${branch.sampleCommunityTrackId}` : `Chat file #${branch.previewAttachmentId}`} is set.{" "}
          <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => setSample(null)}>clear</button>
        </p>
      ) : <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>None set.</p>}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input value={hitQuery} onChange={(e) => setHitQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchHits(); }} placeholder="Search tracks by title" aria-label="Search tracks" style={{ flex: "1 1 240px" }} data-testid="sample-search" />
        <button className="btn" onClick={searchHits}>Search</button>
      </div>
      {hits && (
        <div style={{ marginTop: "0.4rem", maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem" }}>
          {hits.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No track matches.</p>}
          {hits.map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", padding: "0.2rem 0" }}>
              <span><b>{h.title}</b> <span style={{ color: "var(--text-dim)" }}>{h.detail}</span></span>
              <button className="btn" style={{ fontSize: "0.7rem" }} onClick={() => setSample(h.trackId ? { sampleTrackId: h.trackId } : h.communityTrackId ? { sampleCommunityTrackId: h.communityTrackId } : h.attachmentId ? { previewAttachmentId: h.attachmentId } : null)}>use as sample</button>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Sketches ({sketches.length})</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Curated chat attachments contributors can download as a zip.</p>
      {sketches.length > 0 && (
        <ul style={{ fontSize: "0.85rem" }}>
          {sketches.map((s) => (
            <li key={s.id}>
              {s.attachment.filename}{" "}
              <button className="btn btn-danger" style={{ fontSize: "0.72rem" }} onClick={() => removeSketch(s.id)}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="btn" style={{ marginTop: "0.5rem" }} onClick={loadChannelAttachments}>
        Browse this branch's channel attachments
      </button>
      {channelAttachments && (
        <div style={{ marginTop: "0.5rem", maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem" }}>
          {channelAttachments.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No attachments found in this branch's discussion.</p>}
          {channelAttachments.map((a) => {
            const alreadySketch = sketches.some((s) => s.attachment.id === a.id);
            return (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", padding: "0.2rem 0" }}>
                <span>{a.filename}</span>
                <span style={{ display: "flex", gap: "0.3rem" }}>
                  <button className="btn" style={{ fontSize: "0.7rem" }} onClick={() => setPreview(a.id)}>
                    set as preview
                  </button>
                  <button className="btn" style={{ fontSize: "0.7rem" }} disabled={alreadySketch} onClick={() => addSketch(a.id)}>
                    {alreadySketch ? "already a sketch" : "add as sketch"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
