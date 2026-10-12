import { useState } from "react";
import { api } from "../../lib/api";
import type { Block, BlockType } from "./types";

/** Reusable pieces of text (short bio, long bio, press quote…) grouped by the kinds you define. Click one to drop it into the message at the cursor. */
export function BlocksPanel({ types, onTypes, onInsert, onToken, getSelection }: { types: BlockType[]; onTypes: (t: BlockType[]) => void; onInsert: (body: string) => void; onToken: (kind: string) => void; getSelection: () => string }) {
  const [openType, setOpenType] = useState<number | null>(types[0]?.id ?? null);
  const [edit, setEdit] = useState<{ id: number | null; typeId: number; title: string; body: string } | null>(null);
  const [newType, setNewType] = useState("");
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<void>) => { setErr(""); try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); } };

  const addType = () => run(async () => {
    if (!newType.trim()) return;
    const t = await api<{ id: number; name: string }>("/api/outreach/block-types", { method: "POST", body: JSON.stringify({ name: newType }) });
    onTypes([...types, { id: t.id, name: t.name, blocks: [] }]); setNewType(""); setOpenType(t.id);
  });
  const renameType = (t: BlockType) => run(async () => {
    const name = prompt("Rename this kind of block", t.name)?.trim(); if (!name || name === t.name) return;
    await api(`/api/outreach/block-types/${t.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    onTypes(types.map((x) => (x.id === t.id ? { ...x, name } : x)));
  });
  const delType = (t: BlockType) => run(async () => {
    if (!confirm(`Delete "${t.name}" and its ${t.blocks.length} block${t.blocks.length === 1 ? "" : "s"}?`)) return;
    await api(`/api/outreach/block-types/${t.id}`, { method: "DELETE" }); onTypes(types.filter((x) => x.id !== t.id));
  });
  const saveBlock = () => run(async () => {
    if (!edit || !edit.title.trim()) return;
    const body = JSON.stringify({ typeId: edit.typeId, title: edit.title, body: edit.body });
    if (edit.id === null) {
      const b = await api<Block>("/api/outreach/blocks", { method: "POST", body });
      onTypes(types.map((t) => (t.id === edit.typeId ? { ...t, blocks: [...t.blocks, b] } : t)));
    } else {
      const b = await api<Block>(`/api/outreach/blocks/${edit.id}`, { method: "PATCH", body });
      onTypes(types.map((t) => ({ ...t, blocks: t.blocks.filter((x) => x.id !== b.id) })).map((t) => (t.id === b.typeId ? { ...t, blocks: [...t.blocks, b].sort((x, y) => x.id - y.id) } : t)));
    }
    setEdit(null);
  });
  const delBlock = (b: Block) => run(async () => {
    if (!confirm(`Delete the block "${b.title}"?`)) return;
    await api(`/api/outreach/blocks/${b.id}`, { method: "DELETE" });
    onTypes(types.map((t) => ({ ...t, blocks: t.blocks.filter((x) => x.id !== b.id) })));
  });

  return (
    <aside className="ox-blocks" aria-label="Blocks of text">
      <h3>Blocks</h3>
      {types.length === 0 && <p className="ox-hint">Make a kind of block (Short bio, Long bio, Statement…) then add as many versions as you like.</p>}
      {types.map((t) => (
        <div key={t.id} className={"ox-btype" + (openType === t.id ? " open" : "")}>
          <div className="ox-btype-head">
            <button className="btn-link" onClick={() => setOpenType(openType === t.id ? null : t.id)} aria-expanded={openType === t.id}>{openType === t.id ? "▾" : "▸"} {t.name} <span className="ox-dim">{t.blocks.length}</span></button>
            <span><button className="btn-link" onClick={() => onToken(t.name)} title={`Put {{block:${t.name}}} in the message: the right version is chosen per person (set under the text)`}>{"{{ }}"}</button> <button className="btn-link" onClick={() => renameType(t)} aria-label={`Rename ${t.name}`}>rename</button> <button className="btn-link" onClick={() => delType(t)} aria-label={`Delete ${t.name}`}>✕</button></span>
          </div>
          {openType === t.id && (
            <ul>
              {t.blocks.map((b) => (
                <li key={b.id}>
                  <button className="ox-bins" onClick={() => onInsert(b.body)} title={b.body.slice(0, 300)}>
                    <b>{b.title}</b><small>{b.body.replace(/\s+/g, " ").slice(0, 90)}</small>
                  </button>
                  <span className="ox-bacts"><button className="btn-link" onClick={() => setEdit({ id: b.id, typeId: b.typeId, title: b.title, body: b.body })}>edit</button> <button className="btn-link" onClick={() => delBlock(b)} aria-label={`Delete ${b.title}`}>✕</button></span>
                </li>
              ))}
              <li><button className="btn-link" onClick={() => setEdit({ id: null, typeId: t.id, title: "", body: getSelection() })}>+ Add a {t.name.toLowerCase()}{getSelection() ? " from the selected text" : ""}</button></li>
            </ul>
          )}
        </div>
      ))}
      <div className="ox-addcol"><input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New kind, e.g. Short bio" onKeyDown={(e) => { if (e.key === "Enter") addType(); }} /><button className="btn" onClick={addType} disabled={!newType.trim()}>Add</button></div>
      {err && <p className="ox-err" role="alert">{err}</p>}
      {edit && (
        <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="ox-modal" role="dialog" aria-label="Block">
            <header><h2>{edit.id === null ? "New block" : "Edit block"}</h2><button className="btn" onClick={() => setEdit(null)} aria-label="Close">✕</button></header>
            <label className="ox-block">Kind<select value={edit.typeId} onChange={(e) => setEdit({ ...edit, typeId: Number(e.target.value) })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="ox-block">Title (only for you)<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. 50 words, festivals" /></label>
            <label className="ox-block">Text (same writing format as the composer; pictures, <code>@audio(…)</code> and <code>@file(…)</code> lines work too)<textarea rows={10} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
            <footer><button className="btn btn-primary" onClick={saveBlock} disabled={!edit.title.trim()}>Save block</button></footer>
          </div>
        </div>
      )}
    </aside>
  );
}
