import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Branch } from "../../lib/types";

interface Font {
  id: number;
  name: string;
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [form, setForm] = useState({ slug: "", name: "", description: "", parentId: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", fontId: "" });

  function load() {
    api<Branch[]>("/api/admin/branches").then(setBranches);
    api<Font[]>("/api/fonts").then(setFonts);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/branches", {
        method: "POST",
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description || undefined,
          parentId: form.parentId ? Number(form.parentId) : undefined,
        }),
      });
      setForm({ slug: "", name: "", description: "", parentId: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setEditForm({ name: b.name, description: b.description ?? "", fontId: b.fontId ? String(b.fontId) : "" });
  }

  async function saveEdit(id: number) {
    await api(`/api/admin/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description,
        fontId: editForm.fontId ? Number(editForm.fontId) : null,
      }),
    });
    setEditingId(null);
    load();
  }

  async function toggleHidden(b: Branch) {
    await api(`/api/admin/branches/${b.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !b.hidden }) });
    load();
  }

  async function handleDelete(b: Branch) {
    const confirmed = confirm(
      `Permanently delete "${b.name}"? This removes its forum topic, every message in it, every album and track, and can't be undone. Consider hiding it instead if you're not sure.`,
    );
    if (!confirmed) return;
    await api(`/api/admin/branches/${b.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Branches</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: 420, marginBottom: "2rem" }}>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            required
            placeholder="ambient-drift"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="parent">Parent branch (optional)</label>
          <select
            id="parent"
            value={form.parentId}
            onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          >
            <option value="">— none, top-level —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Create branch
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Topic</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id}>
              {editingId === b.id ? (
                <td colSpan={2}>
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ marginBottom: "0.2rem" }} />
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <select value={editForm.fontId} onChange={(e) => setEditForm((f) => ({ ...f, fontId: e.target.value }))}>
                    <option value="">— site default font —</option>
                    {fonts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </td>
              ) : (
                <>
                  <td>{b.name}</td>
                  <td className="mono">{b.slug}</td>
                </>
              )}
              <td className="mono">{b.channel?.slug ?? "—"}</td>
              <td>{b.hidden ? "hidden" : "visible"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {editingId === b.id ? (
                  <>
                    <button className="btn btn-primary" onClick={() => saveEdit(b.id)}>
                      Save
                    </button>{" "}
                    <button className="btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn" onClick={() => startEdit(b)}>
                      Edit
                    </button>{" "}
                    <button className="btn" onClick={() => toggleHidden(b)}>
                      {b.hidden ? "Unhide" : "Hide"}
                    </button>{" "}
                    <button className="btn btn-danger" onClick={() => handleDelete(b)}>
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
