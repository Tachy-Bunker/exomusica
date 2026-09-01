import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";

function snippetFor(mimeType: string, url: string, filename: string): string {
  if (mimeType.startsWith("image/")) return `![${filename}](${url})`;
  if (mimeType.startsWith("audio/")) return `@audio(${url})`;
  if (mimeType.startsWith("video/")) return `@video(${url})`;
  return `@file(${url})[${filename}]`;
}

interface PostSummary {
  id: number;
  slug: string;
  title: string;
  publishedAt: string | null;
  fontId: number | null;
}

interface Font {
  id: number;
  name: string;
}

export function BlogAdminPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [form, setForm] = useState({ slug: "", title: "", contentMarkdown: "", publish: true });
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
    const pos = textareaRef.current?.selectionStart ?? form.contentMarkdown.length;
    setForm((f) => ({
      ...f,
      contentMarkdown: `${f.contentMarkdown.slice(0, pos)}\n${snippet}\n${f.contentMarkdown.slice(pos)}`,
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function load() {
    api<PostSummary[]>("/api/admin/blog").then(setPosts);
    api<Font[]>("/api/fonts").then(setFonts);
  }

  useEffect(load, []);

  async function changeFont(post: PostSummary, fontIdStr: string) {
    await api(`/api/admin/blog/${post.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fontId: fontIdStr ? Number(fontIdStr) : null }),
    });
    load();
  }

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
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <input ref={fileInputRef} type="file" onChange={handleMediaUpload} style={{ fontSize: "0.75rem" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Inserts the right embed snippet at your cursor.</span>
          </div>
          <textarea
            ref={textareaRef}
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
                )}{" "}
                <select value={p.fontId ?? ""} onChange={(e) => changeFont(p, e.target.value)} style={{ fontSize: "0.8rem" }}>
                  <option value="">— default font —</option>
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
