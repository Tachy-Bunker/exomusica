import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { resetGlossaryCache, type GlossaryData, type GlossaryEntry } from "../../lib/glossary";

/** Glossary terms. The Glossary page itself is a wiki page holding a {glossary} line: it can sit under any article in the Log and take a font like any page. */
export function GlossaryAdminPage() {
  const [data, setData] = useState<GlossaryData | null>(null);
  const [edit, setEdit] = useState<GlossaryEntry | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { resetGlossaryCache(); api<GlossaryData>("/api/glossary").then(setData).catch(() => setData({ terms: [], pageSlug: null })); };
  useEffect(load, []);

  async function createPage() {
    setError(null);
    try { await api("/api/admin/wiki", { method: "POST", body: JSON.stringify({ slug: "glossary", title: "Glossary", contentMarkdown: "Terms used around XenoLab.\n\n{glossary}" }) }); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't create the page (a page called glossary may already exist: add a {glossary} line to it)"); }
  }
  if (!data) return <p className="home-dim">Loading…</p>;
  return (
    <div data-testid="glossary-admin">
      <h2>Glossary</h2>
      <p className="home-dim">
        {data.pageSlug ? <>Shown on <Link to={`/wiki/${data.pageSlug}`}>/wiki/{data.pageSlug}</Link>. Move it under another article with the wiki admin (parent), and pick a font there. Layouts: <code>{"{glossary list}"}</code>, <code>{"{glossary cards}"}</code>, <code>{"{glossary columns}"}</code>.</>
          : <>No page shows it yet. <button type="button" className="btn" onClick={() => void createPage()} data-testid="glossary-create-page">Create the Glossary page</button> (or add a <code>{"{glossary}"}</code> line to any wiki page).</>}
      </p>
      {error && <p className="an-err" role="alert">{error}</p>}
      <p><button type="button" className="btn" onClick={() => setEdit("new")} data-testid="glossary-new">+ New term</button></p>
      {edit && <TermForm item={edit === "new" ? null : edit} onDone={(c) => { setEdit(null); if (c) load(); }} />}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem" }}>
        {data.terms.map((t) => (
          <li key={t.id} data-testid="glossary-row" style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <b>{t.term}</b><span className="home-dim" style={{ flex: 1, minWidth: "12rem" }}>{t.definition.slice(0, 90)}{t.definition.length > 90 ? "…" : ""}</span>
            <button type="button" className="btn" onClick={() => setEdit(t)}>Edit</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermForm({ item, onDone }: { item: GlossaryEntry | null; onDone: (changed: boolean) => void }) {
  const [term, setTerm] = useState(item?.term ?? "");
  const [aliases, setAliases] = useState(item?.aliases.join(", ") ?? "");
  const [definition, setDefinition] = useState(item?.definition ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const body = { term, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), definition };
    try { await api(item ? `/api/admin/glossary/${item.id}` : "/api/admin/glossary", { method: item ? "PATCH" : "POST", body: JSON.stringify(body) }); onDone(true); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  async function remove() {
    if (!item || !window.confirm(`Delete "${item.term}"?`)) return;
    await api(`/api/admin/glossary/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    onDone(true);
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="glossary-form" style={{ display: "grid", gap: "0.4rem", maxWidth: 560, marginBottom: "1rem" }}>
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" aria-label="Term" maxLength={60} />
      <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Other spellings, comma separated (optional)" aria-label="Aliases" />
      <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="Definition (short; **bold**, *italic* and links work)" aria-label="Definition" rows={4} maxLength={4000} />
      {error && <p className="an-err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="btn btn-primary" disabled={!term.trim() || !definition.trim()} data-testid="glossary-save">Save</button>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        {item && <button type="button" className="btn" onClick={() => void remove()}>Delete</button>}
      </div>
    </form>
  );
}
