import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Branch } from "../../lib/types";

interface AlbumSummary {
  id: number;
  slug: string;
  title: string;
  composer: string;
}

interface CollaboratorSummary {
  id: number;
  name: string;
  role: string;
}

export function AlbumsAdminPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorSummary[]>([]);
  const [albumForm, setAlbumForm] = useState({ slug: "", title: "", composer: "", description: "" });
  const [trackForm, setTrackForm] = useState<{ albumId: number | null; title: string; fileUrl: string; format: string }>({
    albumId: null,
    title: "",
    fileUrl: "",
    format: "MP3",
  });
  const [collabMode, setCollabMode] = useState<"existing" | "new">("existing");
  const [collabForm, setCollabForm] = useState({ albumId: 0, existingId: 0, name: "", role: "" });
  const [error, setError] = useState<string | null>(null);

  function loadCollaborators() {
    api<CollaboratorSummary[]>("/api/collaborators").then(setCollaborators);
  }

  useEffect(() => {
    api<Branch[]>("/api/branches").then((b) => {
      setBranches(b);
      if (b[0]) setSelectedBranchId(b[0].id);
    });
    loadCollaborators();
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;
    const branch = branches.find((b) => b.id === selectedBranchId);
    if (!branch) return;
    api<AlbumSummary[]>(`/api/branches/${branch.slug}/albums`).then(setAlbums);
  }, [selectedBranchId, branches]);

  async function handleCreateAlbum(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedBranchId) return;
    try {
      await api("/api/admin/albums", {
        method: "POST",
        body: JSON.stringify({ branchId: selectedBranchId, ...albumForm }),
      });
      setAlbumForm({ slug: "", title: "", composer: "", description: "" });
      const branch = branches.find((b) => b.id === selectedBranchId)!;
      api<AlbumSummary[]>(`/api/branches/${branch.slug}/albums`).then(setAlbums);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleAddTrack(e: FormEvent) {
    e.preventDefault();
    if (!trackForm.albumId) return;
    await api(`/api/admin/albums/${trackForm.albumId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ title: trackForm.title, fileUrl: trackForm.fileUrl, format: trackForm.format }),
    });
    setTrackForm({ albumId: trackForm.albumId, title: "", fileUrl: "", format: "MP3" });
  }

  async function handleAddCollaborator(e: FormEvent) {
    e.preventDefault();
    if (!collabForm.albumId) return;
    let collaboratorId = collabForm.existingId;
    if (collabMode === "new") {
      const created = await api<{ id: number }>("/api/admin/collaborators", {
        method: "POST",
        body: JSON.stringify({ name: collabForm.name, role: collabForm.role }),
      });
      collaboratorId = created.id;
      loadCollaborators();
    }
    if (!collaboratorId) return;
    await api(`/api/admin/albums/${collabForm.albumId}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ collaboratorId }),
    });
    setCollabForm({ albumId: collabForm.albumId, existingId: 0, name: "", role: "" });
  }

  return (
    <div>
      <h1>Albums</h1>

      <div className="field">
        <label htmlFor="branch">Branch</label>
        <select id="branch" value={selectedBranchId ?? ""} onChange={(e) => setSelectedBranchId(Number(e.target.value))}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleCreateAlbum} style={{ maxWidth: 380, marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem" }}>New album</h3>
        <div className="field">
          <input placeholder="slug" required value={albumForm.slug} onChange={(e) => setAlbumForm((f) => ({ ...f, slug: e.target.value }))} />
        </div>
        <div className="field">
          <input placeholder="title" required value={albumForm.title} onChange={(e) => setAlbumForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="field">
          <input placeholder="composer" required value={albumForm.composer} onChange={(e) => setAlbumForm((f) => ({ ...f, composer: e.target.value }))} />
        </div>
        <div className="field">
          <textarea placeholder="description" rows={2} value={albumForm.description} onChange={(e) => setAlbumForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Create album
        </button>
      </form>

      <table style={{ marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Composer</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id}>
              <td>{a.title}</td>
              <td>{a.composer}</td>
              <td className="mono">{a.slug}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        <form onSubmit={handleAddTrack}>
          <h3 style={{ fontSize: "0.9rem" }}>Add track</h3>
          <div className="field">
            <select
              value={trackForm.albumId ?? ""}
              onChange={(e) => setTrackForm((f) => ({ ...f, albumId: Number(e.target.value) }))}
            >
              <option value="" disabled>
                Choose album…
              </option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <input placeholder="track title" required value={trackForm.title} onChange={(e) => setTrackForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="field">
            <input placeholder="file URL" required value={trackForm.fileUrl} onChange={(e) => setTrackForm((f) => ({ ...f, fileUrl: e.target.value }))} />
          </div>
          <div className="field">
            <select value={trackForm.format} onChange={(e) => setTrackForm((f) => ({ ...f, format: e.target.value }))}>
              {["OPUS", "MP3", "FLAC", "WAV", "OGG", "M4A", "AAC"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Add track
          </button>
        </form>

        <form onSubmit={handleAddCollaborator}>
          <h3 style={{ fontSize: "0.9rem" }}>Add collaborator to album</h3>
          <div className="field">
            <select
              value={collabForm.albumId || ""}
              onChange={(e) => setCollabForm((f) => ({ ...f, albumId: Number(e.target.value) }))}
            >
              <option value="" disabled>
                Choose album…
              </option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            <label>
              <input type="radio" checked={collabMode === "existing"} onChange={() => setCollabMode("existing")} /> Existing
            </label>
            <label>
              <input type="radio" checked={collabMode === "new"} onChange={() => setCollabMode("new")} /> New
            </label>
          </div>
          {collabMode === "existing" ? (
            <div className="field">
              <select
                value={collabForm.existingId || ""}
                onChange={(e) => setCollabForm((f) => ({ ...f, existingId: Number(e.target.value) }))}
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
          ) : (
            <>
              <div className="field">
                <input placeholder="name" required value={collabForm.name} onChange={(e) => setCollabForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <input placeholder="role" required value={collabForm.role} onChange={(e) => setCollabForm((f) => ({ ...f, role: e.target.value }))} />
              </div>
            </>
          )}
          <button className="btn btn-primary" type="submit">
            Add & link
          </button>
        </form>
      </div>
    </div>
  );
}
