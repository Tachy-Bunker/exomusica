import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface LinkIcon {
  id: number;
  name: string;
  url: string;
}

export function IconLibraryAdminPage() {
  const [icons, setIcons] = useState<LinkIcon[]>([]);
  const [name, setName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<LinkIcon[]>("/api/link-icons").then(setIcons);
  }
  useEffect(load, []);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !name.trim()) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    await api("/api/admin/link-icons", { method: "POST", body: formData });
    setName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  }

  async function remove(id: number) {
    if (!confirm("Remove this icon? Any links currently using it will fall back to their text label.")) return;
    await api(`/api/admin/link-icons/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Icon Library</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Upload named SVG/PNG icons once here, then pick from this list when adding or editing a link on any album or
        collaborator page — useful for streaming service logos (Spotify, YouTube, Bandcamp, etc).
      </p>

      <div className="field" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <label>Name</label>
          <input placeholder="e.g. Spotify" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <input ref={fileInputRef} type="file" accept="image/svg+xml,image/png" />
        <button className="btn btn-primary" onClick={upload} disabled={!name.trim()}>
          Add
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {icons.map((icon) => (
          <div key={icon.id} style={{ textAlign: "center", width: 80 }}>
            <img src={icon.url} alt={icon.name} style={{ width: 40, height: 40, objectFit: "contain", display: "block", margin: "0 auto" }} />
            <div style={{ fontSize: "0.75rem", marginTop: "0.2rem", overflowWrap: "break-word" }}>{icon.name}</div>
            <button className="btn btn-danger" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", marginTop: "0.2rem" }} onClick={() => remove(icon.id)}>
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
