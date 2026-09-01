import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/api";

interface CollaboratorSummary {
  id: number;
  name: string;
  role: string;
}

interface Feature {
  id: number;
  kind: "COLLABORATOR" | "AWARD" | "CUSTOM";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  position: number;
  collaborator: { id: number; name: string } | null;
}

export function AboutAdminPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorSummary[]>([]);
  const [collabForm, setCollabForm] = useState({ collaboratorId: 0, description: "" });
  const [customForm, setCustomForm] = useState({ kind: "AWARD" as "AWARD" | "CUSTOM", title: "", description: "" });
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  function load() {
    api<Feature[]>("/api/about-features").then((f) => setFeatures(f.sort((a, b) => a.position - b.position)));
  }

  useEffect(() => {
    load();
    api<CollaboratorSummary[]>("/api/collaborators").then(setCollaborators);
  }, []);

  async function handleAddCollaborator(e: FormEvent) {
    e.preventDefault();
    if (!collabForm.collaboratorId) return;
    await api("/api/admin/about-features", {
      method: "POST",
      body: JSON.stringify({
        kind: "COLLABORATOR",
        collaboratorId: collabForm.collaboratorId,
        description: collabForm.description || undefined,
      }),
    });
    setCollabForm({ collaboratorId: 0, description: "" });
    load();
  }

  async function handleAddCustom(e: FormEvent) {
    e.preventDefault();
    await api("/api/admin/about-features", { method: "POST", body: JSON.stringify(customForm) });
    setCustomForm({ kind: "AWARD", title: "", description: "" });
    load();
  }

  async function handleDelete(id: number) {
    await api(`/api/admin/about-features/${id}`, { method: "DELETE" });
    load();
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const other = features[index + direction];
    if (!other) return;
    await api("/api/admin/about-features/swap", {
      method: "POST",
      body: JSON.stringify({ idA: features[index].id, idB: other.id }),
    });
    load();
  }

  async function handleImageUpload(id: number) {
    const file = fileInputs.current[id]?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/about-features/${id}/image`, { method: "POST", body: formData });
    load();
  }

  return (
    <div>
      <h1>About page</h1>

      <h2 style={{ fontSize: "0.9rem" }}>Current order</h2>
      {features.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing featured yet.</p>}
      {features.map((f, i) => (
        <div
          key={f.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.4rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            marginBottom: "0.4rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button className="btn" style={{ padding: "0 0.4rem" }} onClick={() => handleMove(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              className="btn"
              style={{ padding: "0 0.4rem" }}
              onClick={() => handleMove(i, 1)}
              disabled={i === features.length - 1}
            >
              ↓
            </button>
          </div>
          {f.imageUrl && <img src={f.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "var(--radius)" }} />}
          <div style={{ flex: 1 }}>
            <strong>{f.kind === "COLLABORATOR" ? f.collaborator?.name : f.title}</strong>{" "}
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>({f.kind})</span>
            {f.description && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{f.description}</div>}
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            ref={(el) => {
              fileInputs.current[f.id] = el;
            }}
            style={{ width: 120, fontSize: "0.75rem" }}
          />
          <button className="btn" onClick={() => handleImageUpload(f.id)}>
            Set image
          </button>
          <button className="btn btn-danger" onClick={() => handleDelete(f.id)}>
            Remove
          </button>
        </div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginTop: "1.5rem" }}>
        <form onSubmit={handleAddCollaborator}>
          <h3 style={{ fontSize: "0.9rem" }}>Feature a collaborator</h3>
          <div className="field">
            <select
              value={collabForm.collaboratorId || ""}
              onChange={(e) => setCollabForm((f) => ({ ...f, collaboratorId: Number(e.target.value) }))}
            >
              <option value="" disabled>
                Choose collaborator…
              </option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <textarea
              placeholder="About-page description (optional — falls back to their bio)"
              rows={3}
              value={collabForm.description}
              onChange={(e) => setCollabForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Add to About page
          </button>
        </form>

        <form onSubmit={handleAddCustom}>
          <h3 style={{ fontSize: "0.9rem" }}>Add an award or custom entry</h3>
          <div className="field">
            <select value={customForm.kind} onChange={(e) => setCustomForm((f) => ({ ...f, kind: e.target.value as "AWARD" | "CUSTOM" }))}>
              <option value="AWARD">Award</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div className="field">
            <input
              placeholder="Title"
              required
              value={customForm.title}
              onChange={(e) => setCustomForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <textarea
              placeholder="Description"
              rows={3}
              value={customForm.description}
              onChange={(e) => setCustomForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Add to About page
          </button>
        </form>
      </div>
    </div>
  );
}
