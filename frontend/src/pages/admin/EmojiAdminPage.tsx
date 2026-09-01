import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useEmojiStore } from "../../lib/emojiStore";

export function EmojiAdminPage() {
  const { emojis, load, refresh } = useEmojiStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload() {
    const files = fileInput.current?.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    try {
      await api("/api/admin/emojis", { method: "POST", body: formData });
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  async function handleDelete(id: number) {
    await api(`/api/admin/emojis/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function handleRename(id: number) {
    if (!editName.trim()) return;
    await api(`/api/admin/emojis/${id}`, { method: "PATCH", body: JSON.stringify({ name: editName.trim() }) });
    setEditingId(null);
    await refresh();
  }

  return (
    <div>
      <h1>Emoji</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Upload PNG or BMP files — select several at once for a full palette import. The filename (minus extension)
        becomes the emoji's <code>:name:</code>, deduplicated automatically if it's already taken.
      </p>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem" }}>
        <input ref={fileInput} type="file" accept="image/png,image/bmp" multiple />
        <button className="btn btn-primary" onClick={handleUpload} disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "0.8rem" }}>
        {emojis.map((e) => (
          <div key={e.id} style={{ textAlign: "center" }}>
            <img src={e.imageUrl} alt={e.name} style={{ width: 32, height: 32, objectFit: "contain" }} />
            {editingId === e.id ? (
              <div>
                <input
                  autoFocus
                  value={editName}
                  onChange={(ev) => setEditName(ev.target.value)}
                  onKeyDown={(ev) => ev.key === "Enter" && handleRename(e.id)}
                  style={{ width: "90%", fontSize: "0.75rem" }}
                />
                <div>
                  <button className="btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem" }} onClick={() => handleRename(e.id)}>
                    save
                  </button>{" "}
                  <button className="btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem" }} onClick={() => setEditingId(null)}>
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="mono"
                style={{ fontSize: "0.7rem", color: "var(--text-dim)", cursor: "pointer" }}
                onClick={() => {
                  setEditingId(e.id);
                  setEditName(e.name);
                }}
                title="Click to rename"
              >
                :{e.name}:
              </div>
            )}
            <button className="btn btn-danger" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }} onClick={() => handleDelete(e.id)}>
              delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
