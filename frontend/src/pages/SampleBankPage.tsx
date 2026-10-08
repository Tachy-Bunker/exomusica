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
  fileUrl: string | null; // null while a paid resource is still locked
  filename: string;
  paid?: boolean;
  locked?: boolean;
  price?: string | null;
  payNote?: string | null;
  paypalUrl?: string | null;
  owner: string;
  cover?: string | null;
  gallery?: string[];
  createdAt?: string;
}

/** Raw material to build with. Lives in XenoLab's Samples tab. Audio plays right on the card and can be sent to the Analyzer. */
const DEFAULT_DONATE = "https://paypal.me/tachybunker";

/** The unlock box of a paid resource: how to pay, then the code the artist (or the team) hands out. */
function UnlockBox({ item, onUnlocked }: { item: SampleItem; onUnlocked: (fileUrl: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function redeem() {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ fileUrl: string }>(`/api/sample-bank/${item.id}/redeem`, { method: "POST", body: JSON.stringify({ code }) });
      onUnlocked(r.fileUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "That code didn't work."); } finally { setBusy(false); }
  }
  return (
    <div className="res-unlock" data-testid="res-unlock">
      <p className="home-dim res-pay-note">{item.payNote?.trim() || `This resource is paid${item.price ? ` (${item.price})` : ""}. Support its artist with a PayPal donation, then enter the code you are given.`}</p>
      <div className="xl-form-row">
        <a className="btn" href={item.paypalUrl || DEFAULT_DONATE} target="_blank" rel="noreferrer" data-testid="res-paypal">Donate with PayPal{item.price ? ` · ${item.price}` : ""}</a>
        <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void redeem(); }} placeholder="Have a code?" aria-label={`Code for ${item.title}`} autoComplete="off" spellCheck={false} style={{ flex: "1 1 120px", minWidth: 0 }} data-testid="res-code" />
        <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={() => void redeem()} data-testid="res-redeem">Unlock</button>
      </div>
      {error && <p className="an-err" role="alert">{error}</p>}
    </div>
  );
}

export function SamplesPanel({ onAnalyze, focusId = null }: { onAnalyze: () => void; focusId?: number | null }) {
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
  const [copied, setCopied] = useState<number | null>(null);
  useEffect(() => { // a linked resource (/resource/12) is brought into view
    if (focusId === null || !items) return;
    document.getElementById(`resource-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, items === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const unlock = (id: number, fileUrl: string) => setItems((list) => (list ?? []).map((i) => (i.id === id ? { ...i, fileUrl, locked: false } : i)));
  async function copyLink(id: number) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/resource/${id}`); setCopied(id); window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800); } catch { /* the link is also the address of the card */ }
  }

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
    if (!item.fileUrl) return;
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
            <li key={item.id} id={`resource-${item.id}`} className={`xl-card${focusId === item.id ? " xl-card-focus" : ""}`}>
              {item.cover && <img className="xl-cover" src={item.cover} alt="" loading="lazy" />}
              <div className="xl-card-top">
                <b>{item.title}</b>
                <span className="home-dim"><Username name={item.owner} /> · {item.kind.toLowerCase()}{item.paid && <> · <span className={`res-badge${item.locked ? "" : " open"}`}>{item.locked ? (item.price ? `paid · ${item.price}` : "paid") : "unlocked"}</span></>}</span>
              </div>
              {item.description && <p className="xl-card-text">{item.description}</p>}
              {item.gallery && item.gallery.length > 0 && <div className="xl-thumbs">{item.gallery.map((g) => <a key={g} href={g} target="_blank" rel="noreferrer"><img src={g} alt="" loading="lazy" /></a>)}</div>}
              {item.kind === "AUDIO" && item.fileUrl && <audio controls preload="none" src={item.fileUrl} className="xl-audio" aria-label={`Preview ${item.title}`} />}
              {item.tags.length > 0 && <div className="xl-chips">{item.tags.map((t) => <button key={t} className="xl-chip" onClick={() => setTagFilter(t)}>{t}</button>)}</div>}
              {item.locked && <UnlockBox item={item} onUnlocked={(url) => unlock(item.id, url)} />}
              <div className="xl-card-actions">
                {item.fileUrl && <a className="btn" href={item.fileUrl} download={item.filename}>Download</a>}
                {item.kind === "AUDIO" && item.fileUrl && <button className="btn" disabled={busyId === item.id} onClick={() => analyze(item)}>{busyId === item.id ? "Loading…" : "Analyze"}</button>}
                <button className="btn" onClick={() => void copyLink(item.id)} aria-label={`Copy a link to ${item.title}`}>{copied === item.id ? "Link copied" : "Copy link"}</button>
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
