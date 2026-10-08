import { useEffect, useRef, useState } from "react";
import { OpacitySlider } from "../../components/OpacitySlider";
import { api, ApiError } from "../../lib/api";

type Kind = "study" | "news" | "wiki";
interface Entry { id: number; kind: Kind; refSlug: string; text: string | null; imageUrl: string | null; imageOpacity: number | null; active: boolean; title: string | null; missing: boolean }
interface Candidates { title: string; excerpt: string; images: string[] }
const KIND_LABEL: Record<Kind, string> = { study: "Study", news: "News", wiki: "Wiki" };
export const FEATURED_DEFAULT_OPACITY = 0.35;

function EntryEditor({ e, first, last, onMove, onChanged, onRemove }: { e: Entry; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onChanged: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(e.text ?? "");
  const [image, setImage] = useState(e.imageUrl ?? "");
  const [opacity, setOpacity] = useState<number | null>(e.imageOpacity);
  const [cand, setCand] = useState<Candidates | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function expand() {
    setOpen((o) => !o);
    if (cand) return;
    try { setCand(await api<Candidates>(`/api/admin/featured/article?kind=${e.kind}&slug=${encodeURIComponent(e.refSlug)}`)); } catch { setCand({ title: e.title ?? e.refSlug, excerpt: "", images: [] }); }
  }
  async function patch(body: Record<string, unknown>) {
    setMsg(null);
    try { await api(`/api/admin/featured/${e.id}`, { method: "PATCH", body: JSON.stringify(body) }); onChanged(); }
    catch (err) { setMsg(err instanceof ApiError ? err.message : "Couldn't save"); }
  }
  const shownImage = image || cand?.images?.[0] || "";
  return (
    <li className={`feat-admin-item${e.active ? "" : " off"}`} data-testid="featured-entry">
      <div className="feat-admin-head">
        <span className="home-chip">{KIND_LABEL[e.kind]}</span>
        <b>{e.title ?? e.refSlug}</b>
        {e.missing && <span className="an-err">missing or unpublished: hidden on the homepage</span>}
        <span className="feat-admin-tools">
          <button className="btn" onClick={() => onMove(-1)} disabled={first} aria-label="Move up">↑</button>
          <button className="btn" onClick={() => onMove(1)} disabled={last} aria-label="Move down">↓</button>
          <button className="btn" onClick={() => patch({ active: !e.active })}>{e.active ? "Hide" : "Show"}</button>
          <button className="btn" onClick={expand} aria-expanded={open}>{open ? "Close" : "Edit"}</button>
          <button className="btn btn-danger" onClick={onRemove}>Remove</button>
        </span>
      </div>
      {open && (
        <div className="feat-admin-edit">
          <div className="field">
            <label>Preview text <span className="home-dim">(blank = the article's first words)</span></label>
            <textarea rows={3} maxLength={600} value={text} onChange={(ev) => setText(ev.target.value)} onBlur={() => { if (text !== (e.text ?? "")) patch({ text }); }} placeholder={cand?.excerpt || ""} />
          </div>
          <div className="field">
            <label>Background picture <span className="home-dim">(from the article, or a link)</span></label>
            <div className="seo-pics" role="group" aria-label="Pictures from the article">
              <button type="button" className={image === "" ? "on" : ""} aria-pressed={image === ""} onClick={() => { setImage(""); patch({ imageUrl: null }); }} title="Automatic: its cover or first picture" style={{ lineHeight: 1.2, padding: "0.4rem 0.5rem", fontSize: "0.75rem" }}>Auto</button>
              {(cand?.images ?? []).map((u) => <button key={u} type="button" className={u === image ? "on" : ""} aria-pressed={u === image} onClick={() => { setImage(u); patch({ imageUrl: u }); }} title={u}><img src={u} alt="" loading="lazy" decoding="async" /></button>)}
            </div>
            <input value={image} onChange={(ev) => setImage(ev.target.value)} onBlur={() => { if (image !== (e.imageUrl ?? "")) patch({ imageUrl: image || null }); }} placeholder="Or paste a link to a picture" aria-label="Picture link" />
          </div>
          <OpacitySlider value={opacity} fallback={FEATURED_DEFAULT_OPACITY} label="Picture strength" onChange={(v) => { setOpacity(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => patch({ imageOpacity: v }), 400); }} />
          <div className="feat-admin-preview" style={{ ["--bgo" as string]: opacity ?? FEATURED_DEFAULT_OPACITY }} aria-label="Preview">
            {shownImage && <img src={shownImage} alt="" />}
            <div><b>{e.title ?? e.refSlug}</b><p>{text || cand?.excerpt || ""}</p></div>
          </div>
          {msg && <p className="an-err" role="alert">{msg}</p>}
        </div>
      )}
    </li>
  );
}

/** The homepage's "Featured articles": pick studies, news posts and wiki pages, write a preview line, choose a background picture and how strongly it shows. */
export function FeaturedAdminPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [kind, setKind] = useState<Kind>("study");
  const [options, setOptions] = useState<{ slug: string; title: string }[]>([]);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Entry[]>("/api/admin/featured").then(setEntries).catch(() => setEntries([]));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setSlug("");
    const url = kind === "study" ? "/api/studies" : kind === "news" ? "/api/blog" : "/api/wiki";
    api<{ slug: string; title: string }[]>(url).then((l) => setOptions(l.map((x) => ({ slug: x.slug, title: x.title })).sort((a, b) => a.title.localeCompare(b.title)))).catch(() => setOptions([]));
  }, [kind]);

  async function add() {
    if (!slug) return;
    setError(null);
    try { await api("/api/admin/featured", { method: "POST", body: JSON.stringify({ kind, refSlug: slug }) }); setSlug(""); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't add it"); }
  }
  async function move(i: number, d: -1 | 1) {
    if (!entries) return;
    const next = [...entries];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setEntries(next);
    await api("/api/admin/featured/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((x) => x.id) }) }).catch(() => load());
  }
  async function remove(e: Entry) {
    if (!confirm(`Remove "${e.title ?? e.refSlug}" from the featured articles? The article itself stays.`)) return;
    await api(`/api/admin/featured/${e.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div data-testid="featured-admin" style={{ maxWidth: 820 }}>
      <h1>Featured articles</h1>
      <p className="home-dim">They appear on the homepage right under Explore the branches, as a slideshow. Order here is the order there. (The homepage updates within half a minute.)</p>
      <div className="xl-form-row" style={{ margin: "0.8rem 0" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of article">
          <option value="study">Study</option><option value="news">News post</option><option value="wiki">Wiki page</option>
        </select>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Article" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <option value="">- choose -</option>
          {options.map((o) => <option key={o.slug} value={o.slug}>{o.title}</option>)}
        </select>
        <button className="btn btn-primary" onClick={add} disabled={!slug}>Feature it</button>
      </div>
      {error && <p className="an-err" role="alert">{error}</p>}
      {entries === null ? <p className="home-dim">Loading…</p> : entries.length === 0 ? <p className="home-dim">Nothing featured yet: the homepage shows no slideshow.</p> : (
        <ul className="feat-admin-list">
          {entries.map((e, i) => <EntryEditor key={e.id} e={e} first={i === 0} last={i === entries.length - 1} onMove={(d) => move(i, d)} onChanged={load} onRemove={() => remove(e)} />)}
        </ul>
      )}
    </div>
  );
}
