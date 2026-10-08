import { useEffect, useRef, useState } from "react";
import { OpacitySlider } from "./OpacitySlider";
import { api, ApiError } from "../lib/api";
import type { BranchPicture } from "../lib/home";

/** The picture behind a study's card and page. The owner picks one: from the pictures of the branches the study is connected to, from a link, or from their device. */
export function StudyBackground({ studySlug, current, opacity, branches, onChange, onPreview }: { studySlug: string; current: string | null; opacity?: number | null; branches: { slug: string; name: string }[]; onChange: () => void; onPreview?: (v: number | null) => void }) {
  const [strength, setStrength] = useState<number | null>(opacity ?? null);
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => setStrength(opacity ?? null), [opacity]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
  function changeStrength(v: number | null) {
    setStrength(v);
    onPreview?.(v);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { api(`/api/studies/${studySlug}`, { method: "PATCH", body: JSON.stringify({ backgroundOpacity: v }) }).catch(() => setError("Couldn't save the picture strength")); }, 500);
  }
  const [open, setOpen] = useState(false);
  const [pics, setPics] = useState<{ url: string; label: string }[] | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setOpen(true);
    if (pics) return;
    const lists = await Promise.all(branches.map((b) => api<BranchPicture[]>(`/api/branches/${b.slug}/images`).then((l) => l.map((p) => ({ url: p.url, label: `${b.name}: ${p.label}` }))).catch(() => [])));
    const seen = new Set<string>();
    setPics(lists.flat().filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true))).slice(0, 36));
  }
  async function set(url: string | null) {
    setBusy(true); setError(null);
    try {
      await api(`/api/studies/${studySlug}`, { method: "PATCH", body: JSON.stringify({ backgroundUrl: url }) });
      onChange();
      setLink("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save the background"); } finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/studies/${studySlug}/background`, { method: "POST", body: fd });
      onChange();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Upload failed"); } finally { setBusy(false); }
  }

  return (
    <div className="study-bgpick" data-testid="study-background">
      <span className="home-dim">Background: </span>
      {current ? <img className="study-bgpick-thumb" src={current} alt="" /> : <span className="home-dim">none</span>}
      {!open ? <> · <button type="button" className="link-btn" onClick={openPicker} data-testid="study-edit-background">change</button></> : (
        <div className="study-bgpick-panel">
          {branches.length > 0 ? (
            pics === null ? <p className="home-dim">Loading pictures…</p> : pics.length > 0 ? (
              <ul className="study-bgpick-grid" aria-label="Pictures from the connected branches">
                {pics.map((p) => <li key={p.url}><button type="button" className={p.url === current ? "on" : ""} disabled={busy} onClick={() => set(p.url)} title={p.label} aria-label={`Use ${p.label}`}><img src={p.url} alt="" loading="lazy" decoding="async" /></button></li>)}
              </ul>
            ) : <p className="home-dim">The connected branches have no pictures yet.</p>
          ) : <p className="home-dim">Connect a branch to choose from its pictures.</p>}
          {current && <OpacitySlider value={strength} onChange={changeStrength} />}
          <div className="study-bgpick-row">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a link to a picture" aria-label="Link to a picture" />
            <button type="button" className="btn" disabled={busy || !link.trim()} onClick={() => set(link.trim())}>Use link</button>
          </div>
          <div className="study-bgpick-row">
            <label className="btn">Upload a picture<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {current && <button type="button" className="btn" disabled={busy} onClick={() => set(null)}>Remove</button>}
            <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
          </div>
          {error && <p className="an-err" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
