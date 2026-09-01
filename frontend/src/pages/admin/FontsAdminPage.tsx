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

  function load() {
    api<Font[]>("/api/fonts").then(setFonts);
  }
  useEffect(load, []);

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
