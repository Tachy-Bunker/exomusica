import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";

interface PostSummary {
  id: number;
  slug: string;
  title: string;
  publishedAt: string | null;
}

export function BlogAdminPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [form, setForm] = useState({ slug: "", title: "", contentMarkdown: "", publish: true });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<PostSummary[]>("/api/admin/blog").then(setPosts);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/blog", { method: "POST", body: JSON.stringify(form) });
      setForm({ slug: "", title: "", contentMarkdown: "", publish: true });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function togglePublish(post: PostSummary) {
    await api(`/api/admin/blog/${post.id}`, { method: "PATCH", body: JSON.stringify({ publish: !post.publishedAt }) });
    load();
  }

  async function notifySubscribers(post: PostSummary) {
    const result = await api<{ notified: number }>(`/api/admin/blog/${post.id}/notify-subscribers`, { method: "POST" });
    alert(`Sent to ${result.notified} subscriber${result.notified === 1 ? "" : "s"}.`);
  }

  return (
    <div>
      <h1>Blog</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <div className="field">
          <input placeholder="slug" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
        </div>
        <div className="field">
          <input placeholder="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="field">
          <textarea
            placeholder="Markdown content…"
            rows={6}
            required
            value={form.contentMarkdown}
            onChange={(e) => setForm((f) => ({ ...f, contentMarkdown: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={form.publish} onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))} /> Publish
            immediately
          </label>
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Save
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.publishedAt ? "Published" : "Draft"}</td>
              <td>
                <button className="btn" onClick={() => togglePublish(p)}>
                  {p.publishedAt ? "Unpublish" : "Publish"}
                </button>{" "}
                {p.publishedAt && (
                  <button className="btn" onClick={() => notifySubscribers(p)}>
                    Notify subscribers
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
