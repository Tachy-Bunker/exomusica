import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface SampleItem {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  kind: string;
  fileUrl: string;
  filename: string;
  owner: string;
}

export function SampleBankPage() {
  useDocumentTitle("Sample Bank");
  const { user } = useAuth();
  const [items, setItems] = useState<SampleItem[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<SampleItem[]>(`/api/sample-bank${tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : ""}`).then(setItems);
  }
  useEffect(load, [tagFilter]);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !title.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    if (description.trim()) formData.append("description", description.trim());
    formData.append("tags", tags);
    try {
      await api("/api/sample-bank", { method: "POST", body: formData });
      setTitle("");
      setDescription("");
      setTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function remove(id: number) {
    await api(`/api/sample-bank/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Sample Bank</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Raw material, not finished tracks — field recordings, synth presets, alterant scripts, one-shots. Anything
        others might build with.
      </p>

      {user && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.95rem", marginTop: 0 }}>Add something</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input placeholder="Tags, comma separated (e.g. field-recording, water, granular)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input ref={fileInputRef} type="file" style={{ fontSize: "0.8rem" }} />
              <button className="btn btn-primary" onClick={upload}>
                Upload
              </button>
            </div>
            {error && <p style={{ color: "var(--accent-forum)", fontSize: "0.8rem" }}>{error}</p>}
          </div>
        </div>
      )}

      <input
        placeholder="Filter by tag…"
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
        style={{ marginBottom: "1rem", maxWidth: 260 }}
      />

      {items.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Nothing here yet.</p>
      ) : (
        items.map((item) => (
          <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "0.6rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)" }}>{item.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  by {item.owner} · {item.kind}
                </div>
                {item.description && <p style={{ fontSize: "0.85rem", margin: "0.3rem 0" }}>{item.description}</p>}
                {item.tags.length > 0 && (
                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                    {item.tags.map((t) => (
                      <span key={t} className="btn" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", cursor: "pointer" }} onClick={() => setTagFilter(t)}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <a className="btn" href={item.fileUrl} download={item.filename}>
                  Download
                </a>
                {user?.username === item.owner && (
                  <button className="btn btn-danger" onClick={() => remove(item.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
