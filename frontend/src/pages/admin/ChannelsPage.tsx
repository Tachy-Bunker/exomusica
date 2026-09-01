import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

interface ChannelSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  position: number;
  fontId: number | null;
}

interface Font {
  id: number;
  name: string;
}

export function ChannelsPage() {
  const [topics, setTopics] = useState<ChannelSummary[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [form, setForm] = useState({ slug: "", name: "", description: "", category: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "", position: "" });

  function load() {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
    api<Font[]>("/api/fonts").then(setFonts);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/channels", {
        method: "POST",
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description || undefined,
          category: form.category || undefined,
        }),
      });
      setForm({ slug: "", name: "", description: "", category: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function changeFont(topic: ChannelSummary, fontIdStr: string) {
    await api(`/api/admin/channels/${topic.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fontId: fontIdStr ? Number(fontIdStr) : null }),
    });
    load();
  }

  function startEdit(t: ChannelSummary) {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      description: t.description ?? "",
      category: t.category ?? "",
      position: String(t.position),
    });
  }

  async function saveEdit(id: number) {
    await api(`/api/admin/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description,
        category: editForm.category,
        position: Number(editForm.position) || 0,
      }),
    });
    setEditingId(null);
    load();
  }

  return (
    <div>
      <h1>Forum topics</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: 420, marginBottom: "2rem" }}>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            required
            placeholder="art-you-like"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            required
            placeholder="Art You Like"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="category">Category (optional)</label>
          <input
            id="category"
            placeholder="e.g. Off-topic"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Create topic
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Order</th>
            <th>Font</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.slug}>
              {editingId === t.id ? (
                <td colSpan={3}>
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ marginBottom: "0.2rem" }} />
                  <textarea
                    rows={2}
                    placeholder="Description"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ marginBottom: "0.2rem" }}
                  />
                  <input
                    placeholder="Category"
                    value={editForm.category}
                    onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    style={{ marginBottom: "0.2rem" }}
                  />
                  <input
                    type="number"
                    placeholder="Order"
                    value={editForm.position}
                    onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}
                  />
                </td>
              ) : (
                <>
                  <td>
                    <Link to={`/topic/${t.slug}`}>{t.name}</Link>
                    <div className="mono" style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>
                      /{t.slug}
                    </div>
                  </td>
                  <td>{t.category ?? "—"}</td>
                  <td>{t.position}</td>
                </>
              )}
              <td>
                <select value={t.fontId ?? ""} onChange={(e) => changeFont(t, e.target.value)} style={{ fontSize: "0.8rem" }}>
                  <option value="">— default font —</option>
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {editingId === t.id ? (
                  <>
                    <button className="btn btn-primary" onClick={() => saveEdit(t.id)}>
                      Save
                    </button>{" "}
                    <button className="btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
