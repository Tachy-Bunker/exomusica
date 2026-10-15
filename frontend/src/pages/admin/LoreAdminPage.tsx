import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Loading } from "../../components/Loading";
import { OPENING_LORE } from "../../lib/roomLore";

interface LoreRow { id: number; key: string; title: string; body: string }

/** Lore for the 3D rooms. Each entry is the text shown (and kept in the logbook) when someone scans the thing it is keyed to. */
export function LoreAdminPage() {
  const [rows, setRows] = useState<LoreRow[] | null>(null);
  const [edit, setEdit] = useState<LoreRow | "new" | null>(null);
  const load = () => { api<LoreRow[]>("/api/lore").then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])); };
  useEffect(load, []);
  if (!rows) return <Loading />;
  return (
    <div data-testid="lore-admin">
      <h2>Room lore</h2>
      <p className="home-dim">Text for what people scan in the 3D rooms; without an entry the room shows a plain description. The key says what it belongs to:</p>
      <ul className="home-dim" style={{ margin: "0 0 0.8rem 1rem" }}>
        <li><code>branch:slug</code> the inscription on that room's wall</li>
        <li><code>album:slug</code> an album's pedestal</li>
        <li><code>room:slug/terminal</code> the chat terminal of a room</li>
        <li><code>room:slug/door/other-slug</code> the door in <i>slug</i> that leads to <i>other-slug</i></li>
        <li><code>room:slug/seal/&lt;hash&gt;</code> a sealed door (the hash is the hidden branch's address hash, as the Chart shows it)</li>
      </ul>
      <p><button type="button" className="btn" onClick={() => setEdit("new")} data-testid="lore-new">+ New entry</button>{" "}
        <button type="button" className="btn" data-testid="lore-opening" onClick={() => setEdit(rows.find((r) => r.key === "opening:wall") ?? { id: 0, key: "opening:wall", title: "Thanaton", body: OPENING_LORE })}>Edit the opening lore</button></p>
      <p className="home-dim">The opening lore is what the first wall says (the first room, when it has no lore of its own and no description). Key: <code>opening:wall</code>.</p>
      {edit && <LoreForm item={edit === "new" || edit.id === 0 ? (edit === "new" ? null : edit) : edit} onDone={(c) => { setEdit(null); if (c) load(); }} />}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem" }}>
        {rows.map((r) => (
          <li key={r.id} data-testid="lore-row" style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <code>{r.key}</code><b>{r.title}</b><span className="home-dim" style={{ flex: 1, minWidth: "12rem" }}>{r.body.slice(0, 80)}{r.body.length > 80 ? "…" : ""}</span>
            <button type="button" className="btn" onClick={() => setEdit(r)}>Edit</button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="home-dim">No lore yet.</p>}
    </div>
  );
}

function LoreForm({ item, onDone }: { item: LoreRow | null; onDone: (changed: boolean) => void }) {
  const [key, setKey] = useState(item?.key ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try { await api(item && item.id ? `/api/admin/lore/${item.id}` : "/api/admin/lore", { method: item && item.id ? "PATCH" : "POST", body: JSON.stringify({ key, title, body }) }); onDone(true); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  async function remove() {
    if (!item || !window.confirm(`Delete the lore for ${item.key}?`)) return;
    await api(`/api/admin/lore/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    onDone(true);
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="lore-form" style={{ display: "grid", gap: "0.4rem", maxWidth: 560, marginBottom: "1rem" }}>
      <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key, e.g. room:core/terminal" aria-label="Key" maxLength={106} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" maxLength={80} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What the scan says (plain text, up to 3000 characters)" aria-label="Text" rows={6} maxLength={3000} />
      {error && <p className="an-err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="btn btn-primary" disabled={!key.trim() || !title.trim() || !body.trim()} data-testid="lore-save">Save</button>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        {item && item.id > 0 && <button type="button" className="btn" onClick={() => void remove()}>Delete</button>}
      </div>
    </form>
  );
}
