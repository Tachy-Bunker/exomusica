import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Branch } from "../../lib/types";

interface Font {
  id: number;
  name: string;
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [form, setForm] = useState({ slug: "", name: "", description: "", parentId: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    fontId: "",
    parentId: "",
    isAnchor: false,
    guideAssetId: "",
    voiceoverText: "",
    discordChannelId: "",
    discordWebhookUrl: "",
  });
  const [guideAssets, setGuideAssets] = useState<{ id: number; name: string }[]>([]);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Branch[]>("/api/admin/branches").then(setBranches);
    api<Font[]>("/api/fonts").then(setFonts);
    api<{ id: number; name: string }[]>("/api/guide-assets").then(setGuideAssets);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/branches", {
        method: "POST",
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description || undefined,
          parentId: form.parentId ? Number(form.parentId) : undefined,
        }),
      });
      setForm({ slug: "", name: "", description: "", parentId: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setEditForm({
      name: b.name,
      description: b.description ?? "",
      fontId: b.fontId ? String(b.fontId) : "",
      parentId: b.parentId ? String(b.parentId) : "",
      isAnchor: !!b.isAnchor,
      guideAssetId: b.guideAssetId ? String(b.guideAssetId) : "",
      voiceoverText: b.voiceoverText ?? "",
      discordChannelId: b.channel?.discordChannelId ?? "",
      discordWebhookUrl: b.channel?.discordWebhookUrl ?? "",
    });
  }

  async function saveEdit(id: number, channelId: number | undefined) {
    await api(`/api/admin/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description,
        fontId: editForm.fontId ? Number(editForm.fontId) : null,
        parentId: editForm.parentId ? Number(editForm.parentId) : null,
        isAnchor: editForm.isAnchor,
        guideAssetId: editForm.guideAssetId ? Number(editForm.guideAssetId) : null,
        voiceoverText: editForm.voiceoverText,
      }),
    });
    if (channelId) {
      await api(`/api/admin/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({
          discordChannelId: editForm.discordChannelId || null,
          discordWebhookUrl: editForm.discordWebhookUrl || null,
        }),
      });
    }
    setEditingId(null);
    load();
  }

  async function uploadVoiceover(branchId: number) {
    const file = voiceoverInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/branches/${branchId}/voiceover`, { method: "POST", body: formData });
    if (voiceoverInputRef.current) voiceoverInputRef.current.value = "";
    load();
  }

  async function removeVoiceover(branchId: number) {
    await api(`/api/admin/branches/${branchId}/voiceover`, { method: "DELETE" });
    load();
  }

  async function setVisibility(b: Branch, visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS") {
    await api(`/api/admin/branches/${b.id}`, { method: "PATCH", body: JSON.stringify({ visibility }) });
    load();
  }

  async function setCrystalCount(b: Branch, crystalCount: number) {
    if (!Number.isFinite(crystalCount) || crystalCount < 1) return;
    await api(`/api/admin/branches/${b.id}`, { method: "PATCH", body: JSON.stringify({ crystalCount: Math.round(crystalCount) }) });
    load();
  }

  async function handleDelete(b: Branch) {
    const confirmed = confirm(
      `Permanently delete "${b.name}"? This removes its forum topic, every message in it, every album and track, and can't be undone. Consider hiding it instead if you're not sure.`,
    );
    if (!confirmed) return;
    await api(`/api/admin/branches/${b.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Branches</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: 420, marginBottom: "2rem" }}>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            required
            placeholder="ambient-drift"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="parent">Parent branch (optional)</label>
          <select
            id="parent"
            value={form.parentId}
            onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          >
            <option value="">— none, top-level —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Create branch
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Topic</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id}>
              {editingId === b.id ? (
                <td colSpan={2}>
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ marginBottom: "0.2rem" }} />
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <select value={editForm.fontId} onChange={(e) => setEditForm((f) => ({ ...f, fontId: e.target.value }))}>
                    <option value="">— site default font —</option>
                    {fonts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select value={editForm.parentId} onChange={(e) => setEditForm((f) => ({ ...f, parentId: e.target.value }))}>
                    <option value="">— Join/About (center) —</option>
                    {branches
                      .filter((other) => other.id !== b.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name}
                        </option>
                      ))}
                  </select>
                  <label style={{ fontSize: "0.8rem", display: "block", marginTop: "0.2rem" }}>
                    <input
                      type="checkbox"
                      checked={editForm.isAnchor}
                      onChange={(e) => setEditForm((f) => ({ ...f, isAnchor: e.target.checked }))}
                      disabled={!!editForm.parentId}
                    />{" "}
                    Independent anchor (only applies with no parent)
                  </label>
                  <select
                    value={editForm.guideAssetId}
                    onChange={(e) => setEditForm((f) => ({ ...f, guideAssetId: e.target.value }))}
                    style={{ marginTop: "0.3rem" }}
                  >
                    <option value="">— no intro guide —</option>
                    {guideAssets.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    placeholder="Voiceover text (shown during the first-time intro)"
                    value={editForm.voiceoverText}
                    onChange={(e) => setEditForm((f) => ({ ...f, voiceoverText: e.target.value }))}
                    style={{ marginTop: "0.3rem" }}
                  />
                  <input
                    placeholder="Discord channel ID (bridge)"
                    value={editForm.discordChannelId}
                    onChange={(e) => setEditForm((f) => ({ ...f, discordChannelId: e.target.value }))}
                    style={{ marginTop: "0.3rem", width: "100%" }}
                  />
                  <input
                    placeholder="Discord webhook URL (optional — for the {username} | Exo-API format)"
                    value={editForm.discordWebhookUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, discordWebhookUrl: e.target.value }))}
                    style={{ marginTop: "0.3rem", width: "100%" }}
                  />
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.3rem" }}>
                    <input ref={voiceoverInputRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg" style={{ fontSize: "0.75rem" }} />
                    <button className="btn" onClick={() => uploadVoiceover(b.id)}>
                      Upload voiceover
                    </button>
                    {b.voiceoverUrl && (
                      <>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>has audio ✓</span>
                        <button className="btn btn-danger" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }} onClick={() => removeVoiceover(b.id)}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </td>
              ) : (
                <>
                  <td>{b.name}</td>
                  <td className="mono">{b.slug}</td>
                </>
              )}
              <td className="mono">{b.channel?.slug ?? "—"}</td>
              <td>
                <select value={b.visibility ?? "VISIBLE"} onChange={(e) => setVisibility(b, e.target.value as "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS")}>
                  <option value="VISIBLE">Visible</option>
                  <option value="HIDDEN">Hidden</option>
                  <option value="BABY_CRYSTALS">Baby Crystals</option>
                </select>
                {b.visibility === "BABY_CRYSTALS" && (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={b.crystalCount ?? 5}
                    title="Number of crystal shards"
                    style={{ width: 50, marginLeft: "0.3rem" }}
                    onBlur={(e) => setCrystalCount(b, Number(e.target.value))}
                  />
                )}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {editingId === b.id ? (
                  <>
                    <button className="btn btn-primary" onClick={() => saveEdit(b.id, b.channel?.id)}>
                      Save
                    </button>{" "}
                    <button className="btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn" onClick={() => startEdit(b)}>
                      Edit
                    </button>{" "}
                    <button className="btn btn-danger" onClick={() => handleDelete(b)}>
                      Delete
                    </button>
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
