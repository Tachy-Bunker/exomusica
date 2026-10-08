import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { ArticleEditor } from "../../components/ArticleEditor";
import { SeoFieldsEditor } from "../../components/SeoFieldsEditor";

interface Post {
  id: number;
  slug: string;
  title: string;
  contentMarkdown: string;
  publishedAt: string | null;
  fontId: number | null;
  coverImageUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}
interface Font { id: number; name: string }

const EMPTY = { slug: "", title: "", contentMarkdown: "", publish: true, fontId: "", ogTitle: "", ogDescription: "", ogImageUrl: "" };

/** News posts, written in the same editor as studies, with the SEO tool beside the text. */
export function BlogAdminPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function load() {
    return api<Post[]>("/api/admin/blog").then((p) => { setPosts(p); return p; });
  }
  useEffect(() => { load(); api<Font[]>("/api/fonts").then(setFonts); }, []);

  function startNew() { setEditingId(null); setForm(EMPTY); setWriting(true); setSaved(false); setError(null); }
  function startEdit(p: Post) {
    setEditingId(p.id);
    setForm({ slug: p.slug, title: p.title, contentMarkdown: p.contentMarkdown, publish: !!p.publishedAt, fontId: p.fontId ? String(p.fontId) : "", ogTitle: p.ogTitle ?? "", ogDescription: p.ogDescription ?? "", ogImageUrl: p.ogImageUrl ?? "" });
    setWriting(true); setSaved(false); setError(null);
    window.scrollTo({ top: 0 });
  }
  function close() { setWriting(false); setEditingId(null); setForm(EMPTY); if (params.get("edit")) setParams({}, { replace: true }); }

  // /admin/blog?edit=<slug> (the Edit link on a news post in the Log) opens that post
  const wanted = params.get("edit");
  useEffect(() => {
    if (!wanted || writing) return;
    const p = posts.find((x) => x.slug === wanted);
    if (p) startEdit(p);
  }, [wanted, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const seo = { ogTitle: form.ogTitle || null, ogDescription: form.ogDescription || null, ogImageUrl: form.ogImageUrl || null };
    const fontId = form.fontId ? Number(form.fontId) : null;
    try {
      if (editingId) {
        const existing = posts.find((p) => p.id === editingId);
        await api(`/api/admin/blog/${editingId}`, { method: "PATCH", body: JSON.stringify({ title: form.title, contentMarkdown: form.contentMarkdown, fontId, ...seo, ...(!!existing?.publishedAt !== form.publish ? { publish: form.publish } : {}) }) });
      } else {
        await api("/api/admin/blog", { method: "POST", body: JSON.stringify({ slug: form.slug, title: form.title, contentMarkdown: form.contentMarkdown, publish: form.publish, fontId, ...seo }) });
      }
      await load();
      if (editingId) setSaved(true); else close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function togglePublish(post: Post) {
    await api(`/api/admin/blog/${post.id}`, { method: "PATCH", body: JSON.stringify({ publish: !post.publishedAt }) });
    load();
  }
  async function notifySubscribers(post: Post) {
    const result = await api<{ notified: number }>(`/api/admin/blog/${post.id}/notify-subscribers`, { method: "POST" });
    alert(`Sent to ${result.notified} subscriber${result.notified === 1 ? "" : "s"}.`);
  }
  async function remove(post: Post) {
    if (!confirm(`Delete "${post.title}"?`)) return;
    await api(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    if (editingId === post.id) close();
    load();
  }

  return (
    <div>
      <h1>News</h1>
      {!writing && <p><button className="btn btn-primary" onClick={startNew} data-testid="blog-new">New post</button></p>}

      {writing && (
        <form onSubmit={handleSubmit} className="article-form" data-testid="blog-form">
          <h3 style={{ fontSize: "0.95rem" }}>{editingId ? "Editing post" : "New post"}</h3>
          <div className="article-meta">
            <div className="field">
              <input placeholder="slug" required disabled={!!editingId} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} aria-label="Slug" />
              {editingId && <span className="home-dim" style={{ fontSize: "0.75rem" }}>The address can't be changed once created.</span>}
            </div>
            <div className="field"><input placeholder="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-label="Title" /></div>
            <div className="field">
              <select value={form.fontId} onChange={(e) => setForm((f) => ({ ...f, fontId: e.target.value }))} aria-label="Font">
                <option value="">- site default font -</option>
                {fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <ArticleEditor body={form.contentMarkdown} onBodyChange={(next) => setForm((f) => ({ ...f, contentMarkdown: next }))} onNavigate={(path) => navigate(path)} />
          <SeoFieldsEditor
            value={{ ogTitle: form.ogTitle, ogDescription: form.ogDescription, ogImageUrl: form.ogImageUrl }}
            onChange={(patch) => setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ""])) }))}
            page={{ title: form.title, body: form.contentMarkdown, path: `/news/${form.slug}` }}
          />
          <div className="field" style={{ marginTop: "0.6rem" }}>
            <label><input type="checkbox" checked={form.publish} onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))} /> Published</label>
          </div>
          {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit">{editingId ? "Save changes" : "Save"}</button>{" "}
          <button className="btn" type="button" onClick={close}>{editingId ? "Close" : "Cancel"}</button>
          {saved && <span role="status" className="home-dim"> Saved. {form.publish && <Link to={`/news/${form.slug}`}>View it</Link>}</span>}
        </form>
      )}

      <table>
        <thead><tr><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.publishedAt ? "Published" : "Draft"}</td>
              <td>
                <button className="btn" onClick={() => startEdit(p)}>Edit</button>{" "}
                <button className="btn" onClick={() => togglePublish(p)}>{p.publishedAt ? "Unpublish" : "Publish"}</button>{" "}
                {p.publishedAt && <button className="btn" onClick={() => notifySubscribers(p)}>Notify subscribers</button>}{" "}
                <button className="btn btn-danger" onClick={() => remove(p)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
