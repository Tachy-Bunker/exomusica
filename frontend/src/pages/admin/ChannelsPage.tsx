import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { snippetFor } from "../../lib/markdownSnippet";
import { SeoFieldsEditor } from "../../components/SeoFieldsEditor";

interface ChannelSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  contentMarkdown: string | null;
  category: string | null;
  position: number;
  fontId: number | null;
  discordChannelId: string | null;
  discordWebhookUrl: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}

interface Font {
  id: number;
  name: string;
}

interface BackupPreview { slug: string; name: string; messages: number; exists: boolean }

function download(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ChannelsPage() {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ data: unknown; items: BackupPreview[]; chosen: Set<string> } | null>(null);

  async function exportTopics(ids: number[] | "all") {
    setNote(null);
    try {
      const q = ids === "all" ? "all=1" : `ids=${ids.join(",")}`;
      const data = await api<{ topics: { slug: string }[] }>(`/api/admin/topics/export?${q}`);
      download(data, `exomusica-${data.topics.length === 1 ? data.topics[0].slug : "topics"}-${new Date().toISOString().slice(0, 10)}.json`);
      setNote(`Exported ${data.topics.length} topic${data.topics.length === 1 ? "" : "s"}.`);
    } catch (e) { setNote(e instanceof ApiError ? e.message : "Export failed"); }
  }

  async function chooseBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { format?: string; topics?: { slug: string; name: string; messages?: unknown[] }[] };
      if (data.format !== "exomusica-topics" || !Array.isArray(data.topics)) throw new Error();
      const items = data.topics.map((t) => ({ slug: t.slug, name: t.name, messages: t.messages?.length ?? 0, exists: topics.some((x) => x.slug === t.slug) }));
      setRestore({ data, items, chosen: new Set(items.map((i) => i.slug)) });
      setNote(null);
    } catch { setNote("That file is not an Exomusica topic backup."); }
  }

  async function runRestore() {
    if (!restore) return;
    try {
      const r = await api<{ results: { slug: string; created: boolean; added: number; skipped: number }[] }>("/api/admin/topics/import", {
        method: "POST", body: JSON.stringify({ data: restore.data, only: [...restore.chosen] }),
      });
      setNote(r.results.map((x) => `${x.slug}: ${x.created ? "created, " : ""}${x.added} message${x.added === 1 ? "" : "s"} added${x.skipped ? `, ${x.skipped} already there` : ""}`).join(" · "));
      setRestore(null);
      load();
    } catch (e) { setNote(e instanceof ApiError ? e.message : "Import failed"); }
  }

  async function removeTopic(t: ChannelSummary) {
    if (!window.confirm(`Delete "${t.name}" and all its messages? This cannot be undone. Export it first if you may want it back.`)) return;
    try {
      await api(`/api/admin/channels/${t.id}`, { method: "DELETE" });
      setPicked((p) => { const n = new Set(p); n.delete(t.id); return n; });
      load();
    } catch (e) { setNote(e instanceof ApiError ? e.message : "Delete failed"); }
  }

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
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    contentMarkdown: "",
    category: "",
    position: "",
    discordChannelId: "",
    discordWebhookUrl: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: "",
  });
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

  const [searchParams] = useSearchParams();

  function load() {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then((data) => {
      setTopics(data);
      const targetSlug = searchParams.get("slug");
      if (targetSlug) {
        const match = data.find((t) => t.slug === targetSlug);
        if (match) {
          startEdit(match);
          setTimeout(() => document.getElementById(`channel-row-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        }
      }
    });
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
      discordChannelId: t.discordChannelId ?? "",
      discordWebhookUrl: t.discordWebhookUrl ?? "",
      ogTitle: t.ogTitle ?? "",
      ogDescription: t.ogDescription ?? "",
      ogImageUrl: t.ogImageUrl ?? "",
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
        discordChannelId: editForm.discordChannelId || null,
        discordWebhookUrl: editForm.discordWebhookUrl || null,
        ogTitle: editForm.ogTitle || null,
        ogDescription: editForm.ogDescription || null,
        ogImageUrl: editForm.ogImageUrl || null,
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

      <div className="topic-backup" data-testid="topic-backup" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem", maxWidth: 520, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Backup &amp; restore</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button className="btn" disabled={picked.size === 0} onClick={() => exportTopics([...picked])}>Export selected ({picked.size})</button>
          <button className="btn" onClick={() => exportTopics("all")}>Export all</button>
          <label className="btn" style={{ cursor: "pointer" }}>Import…<input type="file" accept="application/json,.json" onChange={chooseBackup} hidden /></label>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>
          Text, authors and replies are saved; uploaded files and reactions are not. Importing never overwrites: missing topics are created, existing ones only get messages they lack.
        </p>
        {restore && (
          <div style={{ marginTop: "0.7rem" }}>
            {restore.items.map((i) => (
              <label key={i.slug} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.15rem 0" }}>
                <input type="checkbox" checked={restore.chosen.has(i.slug)} onChange={(e) => setRestore((r) => {
                  if (!r) return r;
                  const c = new Set(r.chosen); if (e.target.checked) c.add(i.slug); else c.delete(i.slug);
                  return { ...r, chosen: c };
                })} />
                <span>{i.name}</span>
                <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{i.messages} messages · {i.exists ? "merge" : "new"}</span>
              </label>
            ))}
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-primary" disabled={restore.chosen.size === 0} onClick={runRestore}>Import {restore.chosen.size}</button>
              <button className="btn" onClick={() => setRestore(null)}>Cancel</button>
            </div>
          </div>
        )}
        {note && <p role="status" style={{ fontSize: "0.85rem", margin: "0.6rem 0 0" }}>{note}</p>}
      </div>

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
            <th><input type="checkbox" aria-label="Select all topics" checked={topics.length > 0 && picked.size === topics.length} onChange={(e) => setPicked(e.target.checked ? new Set(topics.map((t) => t.id)) : new Set())} /></th>
            <th>Name</th>
            <th>Category</th>
            <th>Order</th>
            <th>Font</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.slug} id={`channel-row-${t.id}`}>
              <td><input type="checkbox" aria-label={`Select ${t.name}`} checked={picked.has(t.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} /></td>
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
                    placeholder="Page content (markdown - text, images, embeds)"
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
                  <SeoFieldsEditor
                    value={{ ogTitle: editForm.ogTitle, ogDescription: editForm.ogDescription, ogImageUrl: editForm.ogImageUrl }}
                    onChange={(patch) => setEditForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ""])) }))}
                  />
                  <input
                    placeholder="Discord channel ID (bridge)"
                    value={editForm.discordChannelId}
                    onChange={(e) => setEditForm((f) => ({ ...f, discordChannelId: e.target.value }))}
                    style={{ marginBottom: "0.2rem", width: "100%" }}
                  />
                  <input
                    placeholder="Discord webhook URL (optional - for the {username} | Exo-API format)"
                    value={editForm.discordWebhookUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, discordWebhookUrl: e.target.value }))}
                    style={{ marginBottom: "0.2rem", width: "100%" }}
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
                  <td>{t.category ?? "-"}</td>
                  <td>{t.position}</td>
                </>
              )}
              <td>
                <select value={t.fontId ?? ""} onChange={(e) => changeFont(t, e.target.value)} style={{ fontSize: "0.8rem" }}>
                  <option value="">- default font -</option>
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
                  <>
                    <button className="btn" onClick={() => startEdit(t)}>Edit</button>{" "}
                    <button className="btn" onClick={() => exportTopics([t.id])} title="Download a backup of this topic">Export</button>{" "}
                    <button className="btn" onClick={() => removeTopic(t)} style={{ color: "var(--accent-danger)" }}>Delete</button>
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
