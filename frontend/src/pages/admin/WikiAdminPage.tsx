import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

function snippetFor(mimeType: string, url: string, filename: string): string {
  if (mimeType.startsWith("image/")) return `![${filename}](${url})`;
  if (mimeType.startsWith("audio/")) return `@audio(${url})`;
  if (mimeType.startsWith("video/")) return `@video(${url})`;
  return `@file(${url})[${filename}]`;
}

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

interface WikiFull extends WikiSummary {
  contentMarkdown: string;
  fontId: number | null;
}

interface Font {
  id: number;
  name: string;
}

const EMPTY_FORM = { slug: "", title: "", contentMarkdown: "", parentId: "", fontId: "" };

export function WikiAdminPage() {
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleMediaUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ url: string; mimeType: string; filename: string }>("/api/admin/media", {
      method: "POST",
      body: formData,
    });
    const snippet = snippetFor(result.mimeType, result.url, result.filename);
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? form.contentMarkdown.length;
    setForm((f) => ({
      ...f,
      contentMarkdown: `${f.contentMarkdown.slice(0, pos)}\n${snippet}\n${f.contentMarkdown.slice(pos)}`,
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function load() {
    api<WikiSummary[]>("/api/wiki").then(setPages);
    api<Font[]>("/api/fonts").then(setFonts);
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
      fontId: full.fontId ? String(full.fontId) : "",
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
      const fontId = form.fontId ? Number(form.fontId) : null;
      if (editingId) {
        await api(`/api/admin/wiki/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: form.title, contentMarkdown: form.contentMarkdown, parentId, fontId }),
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
        {editingId && (
          <div className="field">
            <label>Font (only settable once a page exists)</label>
            <select value={form.fontId} onChange={(e) => setForm((f) => ({ ...f, fontId: e.target.value }))}>
              <option value="">— site default font —</option>
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <input ref={fileInputRef} type="file" onChange={handleMediaUpload} style={{ fontSize: "0.75rem" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Inserts the right embed snippet at your cursor.</span>
          </div>
          <textarea
            ref={textareaRef}
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
