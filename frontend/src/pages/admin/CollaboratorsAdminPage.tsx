import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface CollaboratorSummary {
  id: number;
  slug: string | null;
  name: string;
  role: string;
  bio: string | null;
  pictureUrl: string | null;
  links: { label: string; url: string }[] | null;
}

interface CollaboratorDetail extends CollaboratorSummary {
  linkedUsername: string | null;
  gallery: { id: number; url: string }[];
}

export function CollaboratorsAdminPage() {
  const [collaborators, setCollaborators] = useState<CollaboratorSummary[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CollaboratorDetail | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", bio: "" });
  const [linkUsername, setLinkUsername] = useState("");
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<CollaboratorSummary[]>("/api/collaborators").then(setCollaborators);
  }
  useEffect(load, []);

  async function create() {
    if (!name || !role) return;
    await api("/api/admin/collaborators", { method: "POST", body: JSON.stringify({ name, role }) });
    setName("");
    setRole("");
    load();
  }

  async function openDetail(id: number) {
    const slug = collaborators.find((c) => c.id === id)?.slug;
    let d: CollaboratorDetail;
    if (!slug) {
      const result = await api<{ slug: string }>(`/api/admin/collaborators/${id}/ensure-slug`, { method: "POST" });
      d = await api<CollaboratorDetail>(`/api/collaborators/${result.slug}`);
    } else {
      d = await api<CollaboratorDetail>(`/api/collaborators/${slug}`);
    }
    setDetail({ ...d, id });
    setEditForm({ name: d.name, role: d.role, bio: d.bio ?? "" });
    setEditingId(id);
    load();
  }

  async function saveDetail() {
    if (!editingId) return;
    await api(`/api/admin/collaborators/${editingId}`, { method: "PATCH", body: JSON.stringify(editForm) });
    openDetail(editingId);
  }

  async function uploadPicture() {
    const file = pictureInputRef.current?.files?.[0];
    if (!file || !editingId) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/collaborators/${editingId}/picture`, { method: "POST", body: formData });
    if (pictureInputRef.current) pictureInputRef.current.value = "";
    openDetail(editingId);
  }

  async function uploadGalleryImage() {
    const file = galleryInputRef.current?.files?.[0];
    if (!file || !editingId) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/collaborators/${editingId}/gallery`, { method: "POST", body: formData });
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    openDetail(editingId);
  }

  async function removeGalleryImage(imageId: number) {
    if (!editingId) return;
    await api(`/api/admin/collaborators/${editingId}/gallery/${imageId}`, { method: "DELETE" });
    openDetail(editingId);
  }

  async function linkUser() {
    if (!editingId || !linkUsername.trim()) return;
    const matches = await api<{ id: number; username: string }[]>(`/api/admin/users?q=${encodeURIComponent(linkUsername)}`);
    const target = matches.find((u) => u.username.toLowerCase() === linkUsername.toLowerCase());
    if (!target) {
      alert(`No account found with username "${linkUsername}".`);
      return;
    }
    await api(`/api/admin/collaborators/${editingId}/link-user`, { method: "POST", body: JSON.stringify({ userId: target.id }) });
    setLinkUsername("");
    openDetail(editingId);
  }

  async function unlinkUser() {
    if (!editingId) return;
    await api(`/api/admin/collaborators/${editingId}/unlink-user`, { method: "POST" });
    openDetail(editingId);
  }

  return (
    <div>
      <h1>Collaborators</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", maxWidth: 480 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        <button className="btn btn-primary" onClick={create}>
          Add
        </button>
      </div>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        <ul style={{ listStyle: "none", padding: 0, minWidth: 200 }}>
          {collaborators.map((c) => (
            <li key={c.id} style={{ marginBottom: "0.3rem" }}>
              <button className={`btn ${editingId === c.id ? "btn-primary" : ""}`} onClick={() => openDetail(c.id)} style={{ width: "100%", textAlign: "left" }}>
                {c.name} — {c.role}
              </button>
            </li>
          ))}
        </ul>

        {detail && (
          <div style={{ flex: 1, maxWidth: 480 }}>
            <div className="field">
              <label>Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Role</label>
              <input value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} />
            </div>
            <div className="field">
              <label>Bio</label>
              <textarea rows={4} style={{ width: "100%" }} value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={saveDetail} style={{ marginBottom: "1rem" }}>
              Save
            </button>

            <div className="field">
              <label>Profile picture</label>
              {detail.pictureUrl && (
                <img src={detail.pictureUrl} alt="" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", display: "block", marginBottom: "0.4rem" }} />
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input ref={pictureInputRef} type="file" accept="image/*" />
                <button className="btn" onClick={uploadPicture}>
                  Upload
                </button>
              </div>
            </div>

            <div className="field">
              <label>Gallery</label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                {detail.gallery.map((g) => (
                  <div key={g.id} style={{ position: "relative" }}>
                    <img src={g.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius)" }} />
                    <button
                      className="btn btn-danger"
                      style={{ position: "absolute", top: 0, right: 0, padding: "0 0.3rem", fontSize: "0.7rem" }}
                      onClick={() => removeGalleryImage(g.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input ref={galleryInputRef} type="file" accept="image/*,video/mp4,video/quicktime" />
                <button className="btn" onClick={uploadGalleryImage}>
                  Add
                </button>
              </div>
            </div>

            <div className="field">
              <label>Linked account</label>
              {detail.linkedUsername ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>{detail.linkedUsername}</span>
                  <button className="btn btn-danger" onClick={unlinkUser}>
                    Unlink
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input placeholder="username" value={linkUsername} onChange={(e) => setLinkUsername(e.target.value)} />
                  <button className="btn btn-primary" onClick={linkUser}>
                    Link
                  </button>
                </div>
              )}
              <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                Shows "Their exomusical contributions" on that account, linking here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
