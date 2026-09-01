import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useCustomFont } from "../../lib/useCustomFont";

interface Font {
  id: number;
  name: string;
  familyName: string;
  fileUrl: string;
  format: string;
}

function FontPreviewRow({ font, onDelete }: { font: Font; onDelete: (id: number) => void }) {
  const fontFamily = useCustomFont(font);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 140, fontSize: "0.85rem" }}>{font.name}</span>
      <span style={{ fontFamily, fontSize: "1.1rem", flex: 1 }}>The quick brown fox jumps 0123</span>
      <button className="btn btn-danger" onClick={() => onDelete(font.id)}>
        Delete
      </button>
    </div>
  );
}

export function FontsAdminPage() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [siteDefaultFontId, setSiteDefaultFontId] = useState<number | null>(null);
  const [ambienceUrl, setAmbienceUrl] = useState<string | null>(null);
  const ambienceInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Font[]>("/api/fonts").then(setFonts);
    api<{ defaultFontId: number | null; ambienceUrl: string | null }>("/api/site-settings").then((s) => {
      setSiteDefaultFontId(s.defaultFontId);
      setAmbienceUrl(s.ambienceUrl);
    });
  }
  useEffect(load, []);

  async function uploadAmbience() {
    const file = ambienceInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ ambienceUrl: string }>("/api/admin/site-settings/ambience", { method: "POST", body: formData });
    setAmbienceUrl(result.ambienceUrl);
    if (ambienceInputRef.current) ambienceInputRef.current.value = "";
  }

  async function removeAmbience() {
    await api("/api/admin/site-settings/ambience", { method: "DELETE" });
    setAmbienceUrl(null);
  }

  async function setSiteDefault(idStr: string) {
    const defaultFontId = idStr ? Number(idStr) : null;
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ defaultFontId }) });
    setSiteDefaultFontId(defaultFontId);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    if (name.trim()) formData.append("name", name.trim());
    try {
      await api("/api/admin/fonts", { method: "POST", body: formData });
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this font? Anything currently using it falls back to the site default.")) return;
    await api(`/api/admin/fonts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Fonts</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Upload OTF, TTF, WOFF, or WOFF2 files. Once uploaded, assign one to any branch, discussion topic, wiki page,
        or blog post from that item's edit screen — each picks independently from this library.
      </p>

      <div className="field" style={{ maxWidth: 360 }}>
        <label>Sitewide default font</label>
        <select value={siteDefaultFontId ?? ""} onChange={(e) => setSiteDefault(e.target.value)}>
          <option value="">— built-in default (Space Grotesk) —</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          Applies everywhere nothing more specific overrides it (a branch/topic/wiki/blog font still wins where set).
        </p>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Idle ambience loop</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Plays on loop whenever nothing else is playing, fading in/out around real tracks. Users can turn it off via
          the "Exo-Ambience" checkbox on the homepage.
        </p>
        {ambienceUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
            <audio src={ambienceUrl} controls style={{ height: 32 }} />
            <button className="btn btn-danger" onClick={removeAmbience}>
              Remove
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input ref={ambienceInputRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg" />
          <button className="btn btn-primary" onClick={uploadAmbience}>
            {ambienceUrl ? "Replace" : "Upload"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input placeholder="Display name (optional — defaults to filename)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <input ref={fileInputRef} type="file" accept=".otf,.ttf,.woff,.woff2" />
        <button className="btn btn-primary" onClick={handleUpload}>
          Upload
        </button>
      </div>
      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}

      {fonts.length === 0 && <p style={{ color: "var(--text-dim)" }}>No fonts uploaded yet.</p>}
      {fonts.map((f) => (
        <FontPreviewRow key={f.id} font={f} onDelete={handleDelete} />
      ))}
    </div>
  );
}
