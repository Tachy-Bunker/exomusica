import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";

interface GuideAsset {
  id: number;
  name: string;
  gifUrl: string;
}

export function GuideAssetsAdminPage() {
  const [assets, setAssets] = useState<GuideAsset[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<GuideAsset[]>("/api/guide-assets").then(setAssets);
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
      await api("/api/admin/guide-assets", { method: "POST", body: formData });
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this guide asset? Any branch using it for its intro falls back to none.")) return;
    await api(`/api/admin/guide-assets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Guide assets</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        GIFs for the guide-character intro (Aurora-style) shown the first time someone plays a branch's music.
        Assign one per branch, along with a voiceover and text, from that branch's edit screen.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input ref={fileInputRef} type="file" accept="image/gif" />
        <button className="btn btn-primary" onClick={handleUpload}>
          Upload
        </button>
      </div>
      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {assets.map((a) => (
          <div key={a.id} style={{ textAlign: "center" }}>
            <img
              src={a.gifUrl}
              alt={a.name}
              style={{ width: 120, height: 120, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
            />
            <div style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>{a.name}</div>
            <button className="btn btn-danger" style={{ marginTop: "0.3rem" }} onClick={() => handleDelete(a.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
