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
  contributeBackgroundUrl: string | null;
  contributeBackgroundOpacity: number;
}
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

  async function setPreview(attachmentId: number | null) {
    await api(`/api/admin/branches/${id}`, { method: "PATCH", body: JSON.stringify({ previewAttachmentId: attachmentId }) });
    useToastStore.getState().showToast(attachmentId ? "Preview set ✓" : "Preview cleared");
    load();
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

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Preview audio</h2>
      {branch.previewAttachmentId ? (
        <p style={{ fontSize: "0.85rem" }}>
          Attachment #{branch.previewAttachmentId} set.{" "}
          <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => setPreview(null)}>
            clear
          </button>
        </p>
      ) : (
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>None set - pick one from the channel attachments below.</p>
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
