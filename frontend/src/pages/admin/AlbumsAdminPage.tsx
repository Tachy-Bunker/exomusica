import { useEffect, useRef, useState, type FormEvent } from "react";
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

interface AlbumDetail {
  id: number;
  slug: string;
  title: string;
  composer: string;
  description: string | null;
  coverArtUrl: string | null;
  links: { id: number; label: string; url: string }[];
  gallery: { id: number; url: string }[];
  collaborators: { id: number; name: string }[];
  tracks: { id: number; title: string; fileUrl: string; format: string; position: number; composers: { id: number }[] }[];
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

  const [managingSlug, setManagingSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [linkForm, setLinkForm] = useState({ label: "", url: "" });
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [trackEditForm, setTrackEditForm] = useState({ title: "", fileUrl: "", format: "MP3" });
  const [editingAlbumInfo, setEditingAlbumInfo] = useState(false);
  const [albumEditForm, setAlbumEditForm] = useState({ title: "", composer: "", description: "" });
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

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

  function loadAlbums() {
    const branch = branches.find((b) => b.id === selectedBranchId);
    if (!branch) return;
    api<AlbumSummary[]>(`/api/branches/${branch.slug}/albums`).then(setAlbums);
  }

  useEffect(loadAlbums, [selectedBranchId, branches]);

  function loadDetail(slug: string) {
    api<AlbumDetail>(`/api/albums/${slug}`).then(setDetail);
  }

  useEffect(() => {
    if (managingSlug) loadDetail(managingSlug);
    else setDetail(null);
  }, [managingSlug]);

  function startEditAlbumInfo() {
    if (!detail) return;
    setAlbumEditForm({ title: detail.title, composer: detail.composer, description: detail.description ?? "" });
    setEditingAlbumInfo(true);
  }

  async function saveAlbumInfo() {
    if (!detail) return;
    await api(`/api/admin/albums/${detail.id}`, { method: "PATCH", body: JSON.stringify(albumEditForm) });
    setEditingAlbumInfo(false);
    loadDetail(detail.slug);
    loadAlbums();
  }

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
      loadAlbums();
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
    if (managingSlug) loadDetail(managingSlug);
  }

  function startEditTrack(t: { id: number; title: string; fileUrl: string; format: string }) {
    setEditingTrackId(t.id);
    setTrackEditForm({ title: t.title, fileUrl: t.fileUrl, format: t.format });
  }

  async function saveTrackEdit(id: number) {
    await api(`/api/admin/tracks/${id}`, { method: "PATCH", body: JSON.stringify(trackEditForm) });
    setEditingTrackId(null);
    if (managingSlug) loadDetail(managingSlug);
  }

  async function moveTrack(index: number, direction: -1 | 1) {
    if (!detail) return;
    const other = detail.tracks[index + direction];
    if (!other) return;
    await api("/api/admin/tracks/swap", {
      method: "POST",
      body: JSON.stringify({ idA: detail.tracks[index].id, idB: other.id }),
    });
    loadDetail(detail.slug);
  }

  async function deleteTrack(id: number) {
    if (!confirm("Delete this track?")) return;
    await api(`/api/admin/tracks/${id}`, { method: "DELETE" });
    if (managingSlug) loadDetail(managingSlug);
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
    if (managingSlug) loadDetail(managingSlug);
  }

  async function handleCoverUpload() {
    const file = coverInput.current?.files?.[0];
    if (!file || !detail) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/albums/${detail.id}/cover`, { method: "POST", body: formData });
    loadDetail(detail.slug);
  }

  async function handleGalleryUpload() {
    const files = galleryInput.current?.files;
    if (!files || files.length === 0 || !detail) return;
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    await api(`/api/admin/albums/${detail.id}/gallery`, { method: "POST", body: formData });
    if (galleryInput.current) galleryInput.current.value = "";
    loadDetail(detail.slug);
  }

  async function handleDeleteGalleryImage(id: number) {
    if (!detail) return;
    await api(`/api/admin/gallery-images/${id}`, { method: "DELETE" });
    loadDetail(detail.slug);
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    await api(`/api/admin/albums/${detail.id}/links`, { method: "POST", body: JSON.stringify(linkForm) });
    setLinkForm({ label: "", url: "" });
    loadDetail(detail.slug);
  }

  async function handleDeleteLink(id: number) {
    if (!detail) return;
    await api(`/api/admin/album-links/${id}`, { method: "DELETE" });
    loadDetail(detail.slug);
  }

  async function handleToggleComposer(trackId: number, collaboratorId: number, currentIds: number[]) {
    if (!detail) return;
    const next = currentIds.includes(collaboratorId)
      ? currentIds.filter((id) => id !== collaboratorId)
      : [...currentIds, collaboratorId];
    await api(`/api/admin/tracks/${trackId}/composers`, {
      method: "PUT",
      body: JSON.stringify({ collaboratorIds: next }),
    });
    loadDetail(detail.slug);
  }

  async function clearTrackComposers(trackId: number) {
    if (!detail) return;
    await api(`/api/admin/tracks/${trackId}/composers`, { method: "PUT", body: JSON.stringify({ collaboratorIds: [] }) });
    loadDetail(detail.slug);
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id}>
              <td>{a.title}</td>
              <td>{a.composer}</td>
              <td className="mono">{a.slug}</td>
              <td>
                <button className="btn" onClick={() => setManagingSlug(managingSlug === a.slug ? null : a.slug)}>
                  {managingSlug === a.slug ? "Close" : "Manage"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem" }}>Managing: {detail.title}</h2>

          {editingAlbumInfo ? (
            <div style={{ maxWidth: 420, marginBottom: "1rem" }}>
              <div className="field">
                <input value={albumEditForm.title} onChange={(e) => setAlbumEditForm((f) => ({ ...f, title: e.target.value }))} placeholder="title" />
              </div>
              <div className="field">
                <input value={albumEditForm.composer} onChange={(e) => setAlbumEditForm((f) => ({ ...f, composer: e.target.value }))} placeholder="composer" />
              </div>
              <div className="field">
                <textarea
                  rows={2}
                  value={albumEditForm.description}
                  onChange={(e) => setAlbumEditForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="description"
                />
              </div>
              <button className="btn btn-primary" onClick={saveAlbumInfo}>
                Save
              </button>{" "}
              <button className="btn" onClick={() => setEditingAlbumInfo(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                {detail.composer}
                {detail.description ? ` — ${detail.description}` : ""}
              </p>
              <button className="btn" onClick={startEditAlbumInfo}>
                Edit title / composer / description
              </button>
            </div>
          )}

          <h3 style={{ fontSize: "0.9rem" }}>Cover art</h3>
          {detail.coverArtUrl && <img src={detail.coverArtUrl} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "var(--radius)" }} />}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
            <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" />
            <button className="btn" onClick={handleCoverUpload}>
              Upload cover
            </button>
          </div>

          <h3 style={{ fontSize: "0.9rem", marginTop: "1rem" }}>Gallery</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            {detail.gallery.map((g) => (
              <div key={g.id} style={{ position: "relative" }}>
                {/\.(mp4|mov)$/i.test(g.url) ? (
                  <video src={g.url} muted style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius)" }} />
                ) : (
                  <img src={g.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius)" }} />
                )}
                <button
                  className="btn btn-danger"
                  style={{ position: "absolute", top: 2, right: 2, padding: "0 0.3rem", fontSize: "0.7rem" }}
                  onClick={() => handleDeleteGalleryImage(g.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              ref={galleryInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,video/mp4,video/quicktime"
              multiple
            />
            <button className="btn" onClick={handleGalleryUpload}>
              Upload to gallery
            </button>
          </div>

          <h3 style={{ fontSize: "0.9rem", marginTop: "1rem" }}>Streaming/download links</h3>
          {detail.links.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "0.85rem" }}>
                {l.label} — <span style={{ color: "var(--text-dim)" }}>{l.url}</span>
              </span>
              <button className="btn btn-danger" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }} onClick={() => handleDeleteLink(l.id)}>
                remove
              </button>
            </div>
          ))}
          <form onSubmit={handleAddLink} style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
            <input placeholder="Label (e.g. Bandcamp)" required value={linkForm.label} onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))} />
            <input placeholder="URL" required value={linkForm.url} onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))} style={{ flex: 1 }} />
            <button className="btn" type="submit">
              Add link
            </button>
          </form>

          <h3 style={{ fontSize: "0.9rem", marginTop: "1rem" }}>Tracks</h3>
          {detail.tracks.length === 0 && <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No tracks yet.</p>}
          {detail.tracks.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => moveTrack(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  className="btn"
                  style={{ padding: "0 0.3rem" }}
                  onClick={() => moveTrack(i, 1)}
                  disabled={i === detail.tracks.length - 1}
                >
                  ↓
                </button>
              </div>
              {editingTrackId === t.id ? (
                <>
                  <input
                    value={trackEditForm.title}
                    onChange={(e) => setTrackEditForm((f) => ({ ...f, title: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <input
                    value={trackEditForm.fileUrl}
                    onChange={(e) => setTrackEditForm((f) => ({ ...f, fileUrl: e.target.value }))}
                    style={{ flex: 2 }}
                  />
                  <select value={trackEditForm.format} onChange={(e) => setTrackEditForm((f) => ({ ...f, format: e.target.value }))}>
                    {["OPUS", "MP3", "FLAC", "WAV", "OGG", "M4A", "AAC"].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={() => saveTrackEdit(t.id)}>
                    Save
                  </button>
                  <button className="btn" onClick={() => setEditingTrackId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: "0.85rem" }}>{t.title}</span>
                  <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-dim)", flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.fileUrl}
                  </span>
                  <button className="btn" onClick={() => startEditTrack(t)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => deleteTrack(t.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}

          {detail.collaborators.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.9rem", marginTop: "1rem" }}>Per-track composer</h3>
              {detail.tracks.map((t) => (
                <div key={t.id} style={{ marginBottom: "0.4rem" }}>
                  <div style={{ fontSize: "0.85rem", marginBottom: "0.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {t.title}
                    {t.composers.length > 0 && (
                      <button className="btn" style={{ fontSize: "0.7rem", padding: "0 0.4rem" }} onClick={() => clearTrackComposers(t.id)}>
                        Clear composer
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
                    {detail.collaborators.map((c) => (
                      <label key={c.id} style={{ fontSize: "0.8rem" }}>
                        <input
                          type="checkbox"
                          checked={t.composers.some((tc) => tc.id === c.id)}
                          onChange={() =>
                            handleToggleComposer(
                              t.id,
                              c.id,
                              t.composers.map((tc) => tc.id),
                            )
                          }
                        />{" "}
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

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
