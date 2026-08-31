import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

export function WikiAdminPage() {
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [form, setForm] = useState({ slug: "", title: "", contentMarkdown: "", parentId: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<WikiSummary[]>("/api/wiki").then(setPages);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/wiki", {
        method: "POST",
        body: JSON.stringify({
          slug: form.slug,
          title: form.title,
          contentMarkdown: form.contentMarkdown,
          parentId: form.parentId ? Number(form.parentId) : undefined,
        }),
      });
      setForm({ slug: "", title: "", contentMarkdown: "", parentId: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <h1>Wiki</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <div className="field">
          <input placeholder="slug" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
        </div>
        <div className="field">
          <input placeholder="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="field">
          <select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
            <option value="">— top-level page —</option>
            {pages.map((p) => (
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
          Create page
        </button>
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages.map((p) => (
          <li key={p.id}>
            <Link to={`/wiki/${p.slug}`}>{p.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
