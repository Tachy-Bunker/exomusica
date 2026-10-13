import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { renderMarkdown } from "../../lib/markdown";
import { Loading } from "../Loading";

export interface Phenomenon { id: number; slug: string; title: string; summary: string; body: string; chain: string | null; published: boolean; example: { id: number; title: string; fileUrl: string; albumTitle: string } | null }

/** A pasted link, or just the code at the end of one. */
export const chainCode = (text: string): string => (/[?&]chain=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? text.trim());

/** Named sonic phenomena: what it is, one place to hear it, and a button that sets up the effects chain that makes it. */
export function PhenomenaPanel({ focusSlug }: { focusSlug: string | null }) {
  const isAdmin = !!useAuth().user?.isAdmin;
  const [list, setList] = useState<Phenomenon[] | null>(null);
  const [editing, setEditing] = useState<Phenomenon | "new" | null>(null);
  const load = () => api<Phenomenon[]>(isAdmin ? "/api/admin/phenomena" : "/api/phenomena").then(setList).catch(() => setList([]));
  useEffect(() => { void load(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (list && focusSlug) document.querySelector(`[data-phenomenon="${CSS.escape(focusSlug)}"]`)?.scrollIntoView({ block: "center" }); }, [list, focusSlug]);

  if (!list) return <Loading />;
  return (
    <div data-testid="phenomena-panel">
      {isAdmin && <p><button type="button" className="btn" onClick={() => setEditing("new")} data-testid="phenomenon-new">+ New card</button></p>}
      {editing && <PhenomenonForm item={editing === "new" ? null : editing} onDone={(changed) => { setEditing(null); if (changed) void load(); }} />}
      {list.length === 0 && <p className="home-dim">No phenomena have been described yet.</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,22rem),1fr))" }}>
        {list.map((p) => (
          <li key={p.id} data-phenomenon={p.slug} data-testid="phenomenon-card" className={`phen-card${focusSlug === p.slug ? " on" : ""}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
            <h3 style={{ margin: 0 }} data-probe="lore" data-probe-key={`phenom:${p.slug}`} data-probe-label={p.title} data-probe-note={p.summary || "A named sonic phenomenon."}>{p.title}{!p.published && <span className="home-dim"> (hidden)</span>}</h3>
            {p.summary && <p style={{ margin: "0.3rem 0" }}>{p.summary}</p>}
            {p.body && <details data-probe="lore" data-probe-key={`phenom:${p.slug}#body`} data-probe-label={`${p.title}: notes`} data-probe-note="The notes are in the field now."><summary className="home-dim">More</summary><div>{renderMarkdown(p.body)}</div></details>}
            {p.example && (
              <p style={{ margin: "0.5rem 0 0" }} data-probe="lore" data-probe-key={`phenom:${p.slug}#ex`} data-probe-label={`${p.title}: example`} data-probe-note={`Heard in ${p.example.title}.`}>
                <span className="home-dim">Hear it: {p.example.title} ({p.example.albumTitle})</span>
                <audio controls preload="none" src={p.example.fileUrl} style={{ width: "100%" }} data-testid="phenomenon-audio" />
              </p>
            )}
            <p style={{ margin: "0.5rem 0 0", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {p.chain && <Link data-probe="lore" data-probe-key={`phenom:${p.slug}#chain`} data-probe-label={`${p.title}: preset`} data-probe-note="A chain that makes it." className="btn btn-primary" to={`/xenolab?tab=effects&chain=${p.chain}`} data-testid="phenomenon-reproduce">Reproduce this</Link>}
              {isAdmin && <button type="button" className="btn" onClick={() => setEditing(p)} data-testid="phenomenon-edit">Edit</button>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhenomenonForm({ item, onDone }: { item: Phenomenon | null; onDone: (changed: boolean) => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [chain, setChain] = useState(item?.chain ?? "");
  const [track, setTrack] = useState(item?.example ? String(item.example.id) : "");
  const [published, setPublished] = useState(item?.published ?? true);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const payload = { title, summary, body, chain: chainCode(chain) || null, exampleTrackId: track.trim() ? Number(track) : null, published };
    try {
      await api(item ? `/api/admin/phenomena/${item.id}` : "/api/admin/phenomena", { method: item ? "PATCH" : "POST", body: JSON.stringify(payload) });
      onDone(true);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  async function remove() {
    if (!item || !window.confirm("Delete this card?")) return;
    await api(`/api/admin/phenomena/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    onDone(true);
  }
  return (
    <form className="phen-form" data-testid="phenomenon-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "grid", gap: "0.4rem", maxWidth: 560, marginBottom: "1rem" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" maxLength={120} />
      <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" aria-label="Summary" maxLength={300} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notes (markdown)" aria-label="Notes" rows={5} />
      <input value={chain} onChange={(e) => setChain(e.target.value)} placeholder="Chain link (paste the link from the Effects tab)" aria-label="Chain link" />
      <input value={track} onChange={(e) => setTrack(e.target.value.replace(/\D/g, ""))} placeholder="Example track id (optional)" aria-label="Example track id" inputMode="numeric" />
      <label><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Visible to everyone</label>
      {error && <p className="an-err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="btn btn-primary" disabled={!title.trim()} data-testid="phenomenon-save">Save</button>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        {item && <button type="button" className="btn" onClick={() => void remove()}>Delete</button>}
      </div>
    </form>
  );
}
