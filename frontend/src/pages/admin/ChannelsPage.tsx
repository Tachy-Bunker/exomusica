import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { snippetFor } from "../../lib/markdownSnippet";

interface ChannelSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  contentMarkdown: string | null;
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
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [categorySaved, setCategorySaved] = useState(false);

  const distinctCategories = [...new Set(topics.map((t) => t.category).filter((c): c is string => !!c))];
  const orderedCategories = [...categoryOrder.filter((c) => distinctCategories.includes(c)), ...distinctCategories.filter((c) => !categoryOrder.includes(c))];

  function moveCategory(index: number, direction: -1 | 1) {
    const next = [...orderedCategories];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCategoryOrder(next);
  }

  async function saveCategoryOrder() {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ categoryOrder: orderedCategories }) });
    setCategorySaved(true);
    setTimeout(() => setCategorySaved(false), 2000);
  }
  const [fonts, setFonts] = useState<Font[]>([]);
  const [form, setForm] = useState({ slug: "", name: "", description: "", category: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", contentMarkdown: "", category: "", position: "" });
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleMediaUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ url: string; mimeType: string; filename: string }>("/api/admin/media", { method: "POST", body: formData });
    const snippet = snippetFor(result.mimeType, result.url, result.filename);
    const el = contentTextareaRef.current;
    const pos = el?.selectionStart ?? editForm.contentMarkdown.length;
    setEditForm((f) => ({
      ...f,
      contentMarkdown: `${f.contentMarkdown.slice(0, pos)}\n${snippet}\n${f.contentMarkdown.slice(pos)}`,
    }));
    e.target.value = "";
  }

  function load() {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
    api<Font[]>("/api/fonts").then(setFonts);
    api<{ categoryOrder: string[] | null }>("/api/site-settings").then((s) => setCategoryOrder(s.categoryOrder ?? []));
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
      contentMarkdown: t.contentMarkdown ?? "",
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
        contentMarkdown: editForm.contentMarkdown,
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

      {orderedCategories.length > 1 && (
        <div style={{ marginBottom: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem", maxWidth: 420 }}>
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Category order</h2>
          {orderedCategories.map((c, i) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0" }}>
              <span style={{ flex: 1 }}>{c}</span>
              <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => moveCategory(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => moveCategory(i, 1)} disabled={i === orderedCategories.length - 1}>
                ↓
              </button>
            </div>
          ))}
          <button className="btn btn-primary" onClick={saveCategoryOrder} style={{ marginTop: "0.5rem" }}>
            Save order
          </button>
          {categorySaved && <span style={{ marginLeft: "0.6rem", fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
        </div>
      )}

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
                  <textarea
                    ref={contentTextareaRef}
                    rows={6}
                    placeholder="Page content (markdown — text, images, embeds)"
                    value={editForm.contentMarkdown}
                    onChange={(e) => setEditForm((f) => ({ ...f, contentMarkdown: e.target.value }))}
                    style={{ marginBottom: "0.2rem", width: "100%" }}
                  />
                  <input type="file" accept="image/*,audio/*,video/*" onChange={handleMediaUpload} style={{ marginBottom: "0.2rem", fontSize: "0.75rem" }} />
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
