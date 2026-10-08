import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { ArticleEditor } from "../../components/ArticleEditor";
import { SeoFieldsEditor } from "../../components/SeoFieldsEditor";

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

interface WikiFull extends WikiSummary {
  contentMarkdown: string;
  fontId: number | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}

interface Font { id: number; name: string }

const EMPTY_FORM = { slug: "", title: "", contentMarkdown: "", parentId: "", fontId: "", ogTitle: "", ogDescription: "", ogImageUrl: "" };

/** Wiki pages, written in the same editor as studies, with the SEO tool beside the text. */
export function WikiAdminPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [defaultWikiSlug, setDefaultWikiSlug] = useState<string | null>(null);

  function load() {
    api<WikiSummary[]>("/api/wiki").then(setPages);
    api<Font[]>("/api/fonts").then(setFonts);
    api<{ defaultWikiPage: { slug: string } | null }>("/api/site-settings").then((s) => setDefaultWikiSlug(s.defaultWikiPage?.slug ?? null));
  }
  useEffect(load, []);

  async function setDefaultWikiPage(pageId: number | null) {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ defaultWikiPageId: pageId }) });
    load();
  }

  async function startEdit(p: WikiSummary) {
    const full = await api<WikiFull>(`/api/wiki/${p.slug}`);
    setEditingId(p.id);
    setForm({
      slug: full.slug,
      title: full.title,
      contentMarkdown: full.contentMarkdown,
      parentId: full.parentId ? String(full.parentId) : "",
      fontId: full.fontId ? String(full.fontId) : "",
      ogTitle: full.ogTitle ?? "",
      ogDescription: full.ogDescription ?? "",
      ogImageUrl: full.ogImageUrl ?? "",
    });
    setWriting(true); setSaved(false); setError(null);
    window.scrollTo({ top: 0 });
  }
  function startNew() { setEditingId(null); setForm(EMPTY_FORM); setWriting(true); setSaved(false); setError(null); }
  function close() { setWriting(false); setEditingId(null); setForm(EMPTY_FORM); if (params.get("edit")) setParams({}, { replace: true }); }

  // /admin/wiki?edit=<slug> (the Edit link on a page in the Log) opens that page
  const wanted = params.get("edit");
  useEffect(() => {
    if (!wanted || writing) return;
    const p = pages.find((x) => x.slug === wanted);
    if (p) void startEdit(p);
  }, [wanted, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parentId = form.parentId ? Number(form.parentId) : undefined;
      const fontId = form.fontId ? Number(form.fontId) : null;
      const seo = { ogTitle: form.ogTitle || null, ogDescription: form.ogDescription || null, ogImageUrl: form.ogImageUrl || null };
      if (editingId) {
        await api(`/api/admin/wiki/${editingId}`, { method: "PATCH", body: JSON.stringify({ title: form.title, contentMarkdown: form.contentMarkdown, parentId, fontId, ...seo }) });
        setSaved(true);
      } else {
        await api("/api/admin/wiki", { method: "POST", body: JSON.stringify({ slug: form.slug, title: form.title, contentMarkdown: form.contentMarkdown, parentId, fontId, ...seo }) });
        close();
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this wiki page?")) return;
    await api(`/api/admin/wiki/${id}`, { method: "DELETE" });
    if (editingId === id) close();
    load();
  }

  return (
    <div>
      <h1>Wiki</h1>

      <div className="field" style={{ maxWidth: 360 }}>
        <label>Default page (opens when visiting "Wiki" with no page selected)</label>
        <select value={defaultWikiSlug ? pages.find((p) => p.slug === defaultWikiSlug)?.id ?? "" : ""} onChange={(e) => setDefaultWikiPage(e.target.value ? Number(e.target.value) : null)}>
          <option value="">- none, show the page list -</option>
          {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      {!writing && <p><button className="btn btn-primary" onClick={startNew} data-testid="wiki-new">New page</button></p>}

      {writing && (
        <form onSubmit={handleSubmit} className="article-form" data-testid="wiki-form">
          <h3 style={{ fontSize: "0.95rem" }}>{editingId ? "Editing page" : "New page"}</h3>
          <div className="article-meta">
            <div className="field">
              <input placeholder="slug" required disabled={!!editingId} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} aria-label="Slug" />
              {editingId && <span className="home-dim" style={{ fontSize: "0.75rem" }}>The address can't be changed once created.</span>}
            </div>
            <div className="field"><input placeholder="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-label="Title" /></div>
            <div className="field">
              <select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))} aria-label="Parent page">
                <option value="">- top-level page -</option>
                {pages.filter((p) => p.id !== editingId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="field">
              <select value={form.fontId} onChange={(e) => setForm((f) => ({ ...f, fontId: e.target.value }))} aria-label="Font">
                <option value="">- site default font -</option>
                {fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <p className="home-dim" style={{ fontSize: "0.75rem" }}>A page whose whole text is <code>@branch-index</code> or <code>@collaborator-index</code> shows that live listing.</p>
          <ArticleEditor body={form.contentMarkdown} onBodyChange={(next) => setForm((f) => ({ ...f, contentMarkdown: next }))} onNavigate={(path) => navigate(path)} />
          <SeoFieldsEditor
            value={{ ogTitle: form.ogTitle, ogDescription: form.ogDescription, ogImageUrl: form.ogImageUrl }}
            onChange={(patch) => setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ""])) }))}
            page={{ title: form.title, body: form.contentMarkdown, path: `/wiki/${form.slug}` }}
          />
          {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
          <p style={{ marginTop: "0.6rem" }}>
            <button className="btn btn-primary" type="submit">{editingId ? "Save changes" : "Create page"}</button>{" "}
            <button className="btn" type="button" onClick={close}>{editingId ? "Close" : "Cancel"}</button>
            {saved && <span role="status" className="home-dim"> Saved. <Link to={`/wiki/${form.slug}`}>View it</Link></span>}
          </p>
        </form>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages.map((p) => (
          <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
            <Link to={`/wiki/${p.slug}`}>{p.title}</Link>
            <button className="btn" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }} onClick={() => void startEdit(p)}>Edit</button>
            <button className="btn btn-danger" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }} onClick={() => handleDelete(p.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
