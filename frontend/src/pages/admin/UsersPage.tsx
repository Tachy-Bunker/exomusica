import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Avatar } from "../../components/Avatar";

interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  isGhost: boolean;
  createdAt: string;
}

interface UserDetail extends UserSummary {
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  links: { label: string; url: string }[] | null;
}

export function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<UserSummary[]>(`/api/admin/users?q=${encodeURIComponent(query)}`).then(setUsers);
  }

  useEffect(load, [query]);

  async function handleGhost(user: UserSummary) {
    if (!confirm(`Ghost ${user.username}? Their messages stay, but the account can no longer log in.`)) return;
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    load();
  }

  async function startEdit(u: UserSummary) {
    setError(null);
    const full = await api<UserDetail>(`/api/admin/users/${u.id}`);
    setDetail(full);
    setEditingId(u.id);
  }

  function updateDetail(patch: Partial<UserDetail>) {
    setDetail((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateLink(index: number, patch: Partial<{ label: string; url: string }>) {
    if (!detail) return;
    const links = [...(detail.links ?? [])];
    links[index] = { ...links[index], ...patch };
    updateDetail({ links });
  }

  function addLink() {
    if (!detail) return;
    updateDetail({ links: [...(detail.links ?? []), { label: "", url: "" }] });
  }

  function removeLink(index: number) {
    if (!detail) return;
    updateDetail({ links: (detail.links ?? []).filter((_, i) => i !== index) });
  }

  async function saveEdit() {
    if (!detail) return;
    setError(null);
    try {
      await api(`/api/admin/users/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          username: detail.username,
          bio: detail.bio,
          links: (detail.links ?? []).filter((l) => l.label.trim() && l.url.trim()),
          isAdmin: detail.isAdmin,
        }),
      });
      setEditingId(null);
      setDetail(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed — that username might already be taken.");
    }
  }

  async function uploadAvatar() {
    if (!detail) return;
    const file = avatarInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await api<{ avatarUrl: string }>(`/api/admin/users/${detail.id}/avatar`, { method: "POST", body: formData });
      updateDetail({ avatarUrl: result.avatarUrl });
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Avatar upload failed");
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <input
        placeholder="Search by username…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: "1rem", maxWidth: 300 }}
      />
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Status</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <>
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.isGhost ? "ghost" : u.isAdmin ? "admin" : "active"}</td>
                <td className="mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {!u.isGhost && (
                    <button className="btn" onClick={() => startEdit(u)}>
                      Manage
                    </button>
                  )}{" "}
                  {!u.isGhost && !u.isAdmin && (
                    <button className="btn btn-danger" onClick={() => handleGhost(u)}>
                      Ghost
                    </button>
                  )}
                </td>
              </tr>
              {editingId === u.id && detail && (
                <tr>
                  <td colSpan={4}>
                    <div style={{ display: "flex", gap: "1rem", padding: "0.8rem", background: "var(--bg-elevated)", borderRadius: "var(--radius)" }}>
                      <div style={{ textAlign: "center" }}>
                        <Avatar url={detail.avatarUrl} size={64} />
                        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ fontSize: "0.7rem", display: "block", marginTop: "0.4rem" }} />
                        <button className="btn" style={{ fontSize: "0.75rem", marginTop: "0.3rem" }} onClick={uploadAvatar}>
                          Upload
                        </button>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="field">
                          <label>Username</label>
                          <input value={detail.username} onChange={(e) => updateDetail({ username: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Bio</label>
                          <textarea rows={2} value={detail.bio ?? ""} onChange={(e) => updateDetail({ bio: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Links</label>
                          {(detail.links ?? []).map((l, i) => (
                            <div key={i} style={{ display: "flex", gap: "0.3rem", marginBottom: "0.2rem" }}>
                              <input placeholder="label" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} style={{ width: "35%" }} />
                              <input placeholder="https://…" value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} style={{ flex: 1 }} />
                              <button className="btn" onClick={() => removeLink(i)}>
                                ×
                              </button>
                            </div>
                          ))}
                          <button className="btn" onClick={addLink}>
                            Add link
                          </button>
                        </div>
                        <label style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
                          <input type="checkbox" checked={detail.isAdmin} onChange={(e) => updateDetail({ isAdmin: e.target.checked })} /> Admin
                        </label>
                        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
                        <button className="btn btn-primary" onClick={saveEdit}>
                          Save
                        </button>{" "}
                        <button
                          className="btn"
                          onClick={() => {
                            setEditingId(null);
                            setDetail(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
