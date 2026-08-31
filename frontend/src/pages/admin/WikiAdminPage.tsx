import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

interface WikiFull extends WikiSummary {
  contentMarkdown: string;
}

const EMPTY_FORM = { slug: "", title: "", contentMarkdown: "", parentId: "" };

export function WikiAdminPage() {
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<WikiSummary[]>("/api/wiki").then(setPages);
  }

  useEffect(load, []);

  async function startEdit(p: WikiSummary) {
    const full = await api<WikiFull>(`/api/wiki/${p.slug}`);
    setEditingId(p.id);
    setForm({
      slug: full.slug,
      title: full.title,
      contentMarkdown: full.contentMarkdown,
      parentId: full.parentId ? String(full.parentId) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parentId = form.parentId ? Number(form.parentId) : undefined;
      if (editingId) {
        await api(`/api/admin/wiki/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: form.title, contentMarkdown: form.contentMarkdown, parentId }),
        });
      } else {
        await api("/api/admin/wiki", {
          method: "POST",
          body: JSON.stringify({ slug: form.slug, title: form.title, contentMarkdown: form.contentMarkdown, parentId }),
        });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this wiki page?")) return;
    await api(`/api/admin/wiki/${id}`, { method: "DELETE" });
    if (editingId === id) cancelEdit();
    load();
  }

  return (
    <div>
      <h1>Wiki</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem" }}>{editingId ? "Editing page" : "New page"}</h3>
        <div className="field">
          <input
            placeholder="slug"
            required
            disabled={!!editingId}
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
          {editingId && <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Slug can't be changed once created.</span>}
        </div>
        <div className="field">
          <input placeholder="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="field">
          <select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
            <option value="">— top-level page —</option>
            {pages
              .filter((p) => p.id !== editingId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <textarea
            placeholder="# Title&#10;Markdown content…"
            rows={6}
            required
            value={form.contentMarkdown}
            onChange={(e) => setForm((f) => ({ ...f, contentMarkdown: e.target.value }))}
          />
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          {editingId ? "Save changes" : "Create page"}
        </button>{" "}
        {editingId && (
          <button className="btn" type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages.map((p) => (
          <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
            <Link to={`/wiki/${p.slug}`}>{p.title}</Link>
            <button className="btn" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }} onClick={() => startEdit(p)}>
              Edit
            </button>
            <button className="btn btn-danger" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }} onClick={() => handleDelete(p.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
