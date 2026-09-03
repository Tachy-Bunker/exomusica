import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface EmbedSettings {
  faviconUrl: string | null;
  [key: string]: string | null;
}

const PAGE_TYPES: { key: string; label: string }[] = [
  { key: "Homepage", label: "Homepage (Spacemap)" },
  { key: "BranchDefault", label: "Branches (default — used unless a branch sets its own)" },
  { key: "AlbumDefault", label: "Albums (default)" },
  { key: "WikiDefault", label: "Wiki pages (default)" },
  { key: "NewsDefault", label: "News (default)" },
  { key: "ForumDefault", label: "Forum topics (default)" },
];

export function EmbedsAdminPage() {
  const [settings, setSettings] = useState<EmbedSettings | null>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function load() {
    api<EmbedSettings>("/api/site-settings").then(setSettings);
  }
  useEffect(load, []);

  async function saveField(field: string, value: string) {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ [field]: value || null }) });
  }

  async function uploadFavicon() {
    const file = faviconInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api("/api/admin/site-settings/og-image/faviconUrl", { method: "POST", body: formData });
    load();
  }

  async function uploadOgImage(field: string) {
    const file = imageInputRefs.current[field]?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api(`/api/admin/site-settings/og-image/${field}`, { method: "POST", body: formData });
    load();
  }

  if (!settings) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Favicon & Embeds</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Controls the site's browser tab icon, and what title/description/image show up when a link is shared on
        Discord, Twitter, etc. Individual branches, albums, wiki pages, and news posts can override these later —
        for now, everything on a given page type uses the same default.
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

      {PAGE_TYPES.map(({ key, label }) => {
        const titleField = `og${key}Title`;
        const descField = `og${key}Description`;
        const imageField = `og${key}ImageUrl`;
        return (
          <div key={key} style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1rem" }}>{label}</h2>
            <div className="field">
              <label>Title</label>
              <input defaultValue={settings[titleField] ?? ""} onBlur={(e) => saveField(titleField, e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={2} style={{ width: "100%" }} defaultValue={settings[descField] ?? ""} onBlur={(e) => saveField(descField, e.target.value)} />
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
