import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface EmbedSettings {
  faviconUrl: string | null;
  [key: string]: string | null;
}

const PAGE_TYPES: { key: string; label: string; placeholders: string }[] = [
  { key: "Homepage", label: "Homepage (Spacemap)", placeholders: "No placeholders — this page has no single entity to pull from." },
  { key: "BranchDefault", label: "Branches (default — used unless a branch sets its own)", placeholders: "{title}, {description}" },
  { key: "AlbumDefault", label: "Albums (default)", placeholders: "{title}, {trackCount}, {composer}" },
  { key: "WikiDefault", label: "Wiki pages (default)", placeholders: "{title}, {content:N} — N is how many characters to show, e.g. {content:160}" },
  { key: "NewsDefault", label: "News (default)", placeholders: "{title}, {content:N}" },
  { key: "ForumDefault", label: "Forum topics (default)", placeholders: "{title}, {description}" },
];

export function EmbedsAdminPage() {
  const [settings, setSettings] = useState<EmbedSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedField, setSavedField] = useState<string | null>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function load() {
    api<EmbedSettings>("/api/site-settings").then((s) => {
      setSettings(s);
      setDrafts(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ""])));
    });
  }
  useEffect(load, []);

  async function saveField(field: string) {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ [field]: drafts[field] || null }) });
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1800);
    load();
  }

  async function uploadFavicon() {
    const file = faviconInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api("/api/admin/site-settings/og-image/faviconUrl", { method: "POST", body: formData });
    if (faviconInputRef.current) faviconInputRef.current.value = "";
    load();
  }

  async function uploadOgImage(field: string) {
    const file = imageInputRefs.current[field]?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/site-settings/og-image/${field}`, { method: "POST", body: formData });
    if (imageInputRefs.current[field]) imageInputRefs.current[field]!.value = "";
    load();
  }

  if (!settings) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Favicon & Embeds</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Controls the site's browser tab icon, and what title/description/image show up when a link is shared on
        Discord, Twitter, etc. Individual branches, albums, wiki pages, and news posts can override these later —
        for now, everything on a given page type uses the same default template.
      </p>

      <div className="field" style={{ marginBottom: "1.5rem" }}>
        <label>Favicon</label>
        {settings.faviconUrl && <img src={settings.faviconUrl} alt="" style={{ width: 32, height: 32, display: "block", marginBottom: "0.4rem" }} />}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,image/svg+xml" />
          <button className="btn" onClick={uploadFavicon}>
            Upload
          </button>
        </div>
      </div>

      {PAGE_TYPES.map(({ key, label, placeholders }) => {
        const titleField = `og${key}Title`;
        const descField = `og${key}Description`;
        const imageField = `og${key}ImageUrl`;
        return (
          <div key={key} style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1rem" }}>{label}</h2>
            <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "-0.3rem" }}>Placeholders: {placeholders}</p>
            <div className="field">
              <label>Title template</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={drafts[titleField] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [titleField]: e.target.value }))}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={() => saveField(titleField)}>
                  Save
                </button>
              </div>
              {savedField === titleField && <span style={{ fontSize: "0.8rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
            </div>
            <div className="field">
              <label>Description template</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <textarea
                  rows={2}
                  style={{ flex: 1 }}
                  value={drafts[descField] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [descField]: e.target.value }))}
                />
                <button className="btn btn-primary" onClick={() => saveField(descField)}>
                  Save
                </button>
              </div>
              {savedField === descField && <span style={{ fontSize: "0.8rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
            </div>
            <div className="field">
              <label>Image</label>
              {settings[imageField] && (
                <img src={settings[imageField]!} alt="" style={{ width: 120, display: "block", marginBottom: "0.4rem", borderRadius: "var(--radius)" }} />
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  ref={(el) => {
                    imageInputRefs.current[imageField] = el;
                  }}
                  type="file"
                  accept="image/*"
                />
                <button className="btn" onClick={() => uploadOgImage(imageField)}>
                  Upload
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
