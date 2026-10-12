import { useState } from "react";
import { api } from "../../lib/api";
import { COL_TYPES, COL_TYPE_LABEL, type Col, type ColType } from "./types";

export function ColumnsModal({ cols, focusId, onChange, onClose }: { cols: Col[]; focusId: number | null; onChange: (cols: Col[], reloadContacts: boolean) => void; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(focusId);
  const [err, setErr] = useState("");
  const [nn, setNn] = useState(""); const [nt, setNt] = useState<ColType>("text");
  const run = async (f: () => Promise<void>) => { setErr(""); try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); } };

  const add = () => run(async () => {
    if (!nn.trim()) return;
    const c = await api<Col>("/api/admin/outreach/columns", { method: "POST", body: JSON.stringify({ name: nn, type: nt }) });
    setNn(""); onChange([...cols, c], false); setOpen(c.id);
  });
  const patch = (c: Col, body: Partial<Col>, reload = false) => run(async () => {
    const out = await api<Col>(`/api/admin/outreach/columns/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
    onChange(cols.map((x) => (x.id === c.id ? out : x)), reload);
  });
  const remove = (c: Col) => run(async () => {
    if (!confirm(`Delete the column "${c.name}" and everything typed in it?`)) return;
    await api(`/api/admin/outreach/columns/${c.id}`, { method: "DELETE" }); onChange(cols.filter((x) => x.id !== c.id), true);
  });
  const move = (i: number, d: -1 | 1) => run(async () => {
    const j = i + d; if (j < 0 || j >= cols.length) return;
    const next = cols.slice(); [next[i], next[j]] = [next[j], next[i]];
    onChange(next, false); await api("/api/admin/outreach/columns/order", { method: "PUT", body: JSON.stringify({ ids: next.map((c) => c.id) }) });
  });

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Columns">
        <header><h2>Columns</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <p className="ox-hint">Name, Email, Last sent, Times sent and Follow up are always there. Every column below is also a merge field: write <code>{"{{key}}"}</code> in a message.</p>
        <ul className="ox-collist">
          {cols.map((c, i) => (
            <li key={c.id} className={open === c.id ? "open" : ""}>
              <div className="ox-colrow">
                <button className="btn-link" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>{c.name}</button>
                <code title="merge field">{`{{${c.key}}}`}</code><span className="ox-dim">{COL_TYPE_LABEL[c.type]}</span>
                <span className="ox-colbtns">
                  <button className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">←</button>
                  <button className="btn" onClick={() => move(i, 1)} disabled={i === cols.length - 1} aria-label="Move right">→</button>
                  <button className="btn" onClick={() => patch(c, { hidden: !c.hidden })}>{c.hidden ? "Show" : "Hide"}</button>
                </span>
              </div>
              {open === c.id && <ColumnEditor col={c} onSave={(b, reload) => patch(c, b, reload)} onDelete={() => remove(c)} />}
            </li>
          ))}
        </ul>
        <div className="ox-addcol">
          <input value={nn} onChange={(e) => setNn(e.target.value)} placeholder="New column, e.g. Festival" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <select value={nt} onChange={(e) => setNt(e.target.value as ColType)}>{COL_TYPES.map((t) => <option key={t} value={t}>{COL_TYPE_LABEL[t]}</option>)}</select>
          <button className="btn btn-primary" onClick={add} disabled={!nn.trim()}>Add column</button>
        </div>
        {err && <p className="ox-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}

function ColumnEditor({ col, onSave, onDelete }: { col: Col; onSave: (b: Partial<Col>, reload: boolean) => void; onDelete: () => void }) {
  const [name, setName] = useState(col.name), [type, setType] = useState<ColType>(col.type), [opts, setOpts] = useState(col.options.join("\n"));
  const hasOpts = type === "select" || type === "multiselect";
  const changed = name !== col.name || type !== col.type || (hasOpts && opts !== col.options.join("\n"));
  return (
    <div className="ox-coled">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value as ColType)}>{COL_TYPES.map((t) => <option key={t} value={t}>{COL_TYPE_LABEL[t]}</option>)}</select></label>
      {type !== col.type && <p className="ox-hint">Changing the type converts what is typed in the column; what can't be converted is cleared.</p>}
      {hasOpts && <label>Choices (one per line)<textarea rows={4} value={opts} onChange={(e) => setOpts(e.target.value)} /></label>}
      <div className="ox-row">
        <button className="btn btn-primary" disabled={!changed || !name.trim()} onClick={() => onSave({ name, type, ...(hasOpts ? { options: opts.split("\n").map((x) => x.trim()).filter(Boolean) } : {}) }, true)}>Save column</button>
        <button className="btn btn-danger" onClick={onDelete}>Delete column</button>
      </div>
    </div>
  );
}
