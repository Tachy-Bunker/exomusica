import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { setPendingAnalysis } from "../lib/analyzerHandoff";
import { useAuth } from "../lib/auth";
import { Username } from "../components/Username";

interface SampleItem {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  kind: string;
  fileUrl: string;
  filename: string;
  owner: string;
  cover?: string | null;
  gallery?: string[];
  createdAt?: string;
}

/** Raw material to build with. Lives in XenoLab's Samples tab. Audio plays right on the card and can be sent to the Analyzer. */
export function SamplesPanel({ onAnalyze }: { onAnalyze: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<SampleItem[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    api<SampleItem[]>(`/api/sample-bank${tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : ""}`).then((list) => {
      setItems(list);
      if (!tagFilter) setAllTags(topTags(list));
    }).catch(() => setItems([]));
  }
  useEffect(load, [tagFilter]);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { setError("Choose a file first."); return; }
    if (!title.trim()) { setError("Give it a title."); return; }
    setError(null);
    const formData = new FormData();
    formData.append("title", title.trim());
    if (description.trim()) formData.append("description", description.trim());
    formData.append("tags", tags);
    formData.append("file", file);
    const cover = coverInputRef.current?.files?.[0];
    if (cover) formData.append("cover", cover);
    for (const g of Array.from(galleryInputRef.current?.files ?? []).slice(0, 3)) formData.append("gallery", g);
    try {
      await api("/api/sample-bank", { method: "POST", body: formData });
      setTitle(""); setDescription(""); setTags("");
      for (const r of [fileInputRef, coverInputRef, galleryInputRef]) if (r.current) r.current.value = "";
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function remove(id: number) {
    await api(`/api/sample-bank/${id}`, { method: "DELETE" });
    load();
  }

  async function analyze(item: SampleItem) {
    setBusyId(item.id); setError(null);
    try {
      const res = await fetch(item.fileUrl);
      if (!res.ok) throw new Error();
      setPendingAnalysis({ blob: await res.blob(), name: item.filename });
      onAnalyze();
    } catch {
      setError("Could not load that sample to analyze it.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="samples-panel">
      {user && (
        <div className="xl-bar xl-bar-end">
          <button className="btn btn-primary" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add a resource"}</button>
        </div>
      )}

      {user && adding && (
        <div className="xl-form">
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Sample title" />
          <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
          <input placeholder="Tags, comma separated (field-recording, water, granular)" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
          <label className="xl-file"><span className="home-dim">The file</span><input ref={fileInputRef} type="file" aria-label="Resource file" /></label>
          <label className="xl-file"><span className="home-dim">Cover image (optional)</span><input ref={coverInputRef} type="file" accept="image/*" aria-label="Cover image" data-testid="resource-cover" /></label>
          <label className="xl-file"><span className="home-dim">Gallery, up to 3 images (optional)</span><input ref={galleryInputRef} type="file" accept="image/*" multiple aria-label="Gallery images" data-testid="resource-gallery" onChange={(e) => { if (e.target.files && e.target.files.length > 3) { setError("A gallery holds up to 3 images: only the first 3 will be added."); } }} /></label>
          <div className="xl-form-row"><button className="btn btn-primary" onClick={upload}>Upload</button></div>
        </div>
      )}
      {error && <p className="an-err" role="alert">{error}</p>}

      {allTags.length > 0 && (
        <div className="xl-chips" role="group" aria-label="Filter by tag">
          <button className={`xl-chip${tagFilter === "" ? " on" : ""}`} aria-pressed={tagFilter === ""} onClick={() => setTagFilter("")}>All</button>
          {allTags.map((t) => <button key={t} className={`xl-chip${tagFilter === t ? " on" : ""}`} aria-pressed={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>{t}</button>)}
        </div>
      )}

      {items === null ? <p className="home-dim">Loading…</p> : items.length === 0 ? (
        <p className="home-dim">{tagFilter ? `Nothing tagged "${tagFilter}".` : "Nothing here yet. Add the first sound."}</p>
      ) : (
        <ul className="xl-cards">
          {items.map((item) => (
            <li key={item.id} className="xl-card">
              {item.cover && <img className="xl-cover" src={item.cover} alt="" loading="lazy" />}
              <div className="xl-card-top">
                <b>{item.title}</b>
                <span className="home-dim"><Username name={item.owner} /> · {item.kind.toLowerCase()}</span>
              </div>
              {item.description && <p className="xl-card-text">{item.description}</p>}
              {item.gallery && item.gallery.length > 0 && <div className="xl-thumbs">{item.gallery.map((g) => <a key={g} href={g} target="_blank" rel="noreferrer"><img src={g} alt="" loading="lazy" /></a>)}</div>}
              {item.kind === "AUDIO" && <audio controls preload="none" src={item.fileUrl} className="xl-audio" aria-label={`Preview ${item.title}`} />}
              {item.tags.length > 0 && <div className="xl-chips">{item.tags.map((t) => <button key={t} className="xl-chip" onClick={() => setTagFilter(t)}>{t}</button>)}</div>}
              <div className="xl-card-actions">
                <a className="btn" href={item.fileUrl} download={item.filename}>Download</a>
                {item.kind === "AUDIO" && <button className="btn" disabled={busyId === item.id} onClick={() => analyze(item)}>{busyId === item.id ? "Loading…" : "Analyze"}</button>}
                {user?.username === item.owner && <button className="btn btn-danger" onClick={() => remove(item.id)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function topTags(list: SampleItem[]): string[] {
  const count = new Map<string, number>();
  for (const i of list) for (const t of i.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([t]) => t);
}
