import { memo, useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { exportRows, filterContacts, isDue, relDay, sortContacts, toCsv, toJson } from "../../lib/outreachSheet";
import { Cell, TextCell } from "./Cells";
import { ColumnsModal } from "./ColumnsModal";
import type { CellValue, Col, Contact } from "./types";

type Patch = { name?: string; email?: string; set?: Record<string, CellValue>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null };
const PAGE = 150;

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Row = memo(function Row({ c, cols, today, on, onPatch, onWrite, onToggle }: {
  c: Contact; cols: Col[]; today: string; on: boolean; onPatch: (id: number, p: Patch) => void; onWrite: (id: number) => void; onToggle: (id: number) => void;
}) {
  const due = isDue(c, today);
  const set = useCallback((key: string, v: CellValue) => onPatch(c.id, { set: { [key]: v } }), [c.id, onPatch]);
  return (
    <tr className={(on ? "sel " : "") + (due ? "due" : "")} data-testid="contact-row">
      <td className="ox-sticky0"><input type="checkbox" checked={on} onChange={() => onToggle(c.id)} aria-label={`Select ${c.name || c.email}`} /></td>
      <td className="ox-sticky1"><TextCell type="text" value={c.name} placeholder="Name" onSave={(v) => onPatch(c.id, { name: v })} /></td>
      <td><TextCell type="email" value={c.email} placeholder="email@…" onSave={(v) => onPatch(c.id, { email: v })} /></td>
      {cols.map((col) => <td key={col.id} className={"t-" + col.type}><Cell col={col} value={c.data[col.key]} onSet={set} /></td>)}
      <td className="ox-sent">
        <input type="date" className="ox-cell-input" value={c.lastSentAt ?? ""} onChange={(e) => onPatch(c.id, { lastSentAt: e.target.value || null })} aria-label="Last sent" />
        <small className="ox-dim">{relDay(today, c.lastSentAt)}</small>
      </td>
      <td className="ox-count"><input type="number" min={0} max={9999} className="ox-cell-input" value={c.sentCount} onChange={(e) => onPatch(c.id, { sentCount: Number(e.target.value) || 0 })} aria-label="Times sent" /></td>
      <td className="ox-sent">
        <input type="date" className={"ox-cell-input" + (due ? " due" : "")} value={c.followUpAt ?? ""} onChange={(e) => onPatch(c.id, { followUpAt: e.target.value || null })} aria-label="Follow up" />
        <small className={due ? "ox-due" : "ox-dim"}>{relDay(today, c.followUpAt)}</small>
      </td>
      <td><button className="btn ox-write" onClick={() => onWrite(c.id)} title={c.email ? `Write to ${c.name || c.email}` : "Add an email address first"} disabled={!c.email} aria-label={`Write to ${c.name || c.email}`}>✉</button></td>
    </tr>
  );
});

export function ContactSheet({ cols, contacts, today, selected, setSelected, onPatch, onAdd, onDelete, onWrite, onColumns, onImported }: {
  cols: Col[]; contacts: Contact[]; today: string; selected: Set<number>; setSelected: (s: Set<number>) => void;
  onPatch: (id: number, p: Patch) => void; onAdd: () => Promise<void>; onDelete: (ids: number[]) => Promise<void>; onWrite: (ids: number[]) => void;
  onColumns: (cols: Col[], reload: boolean) => void; onImported: () => void;
}) {
  const [q, setQ] = useState(""), [dueOnly, setDue] = useState(false), [never, setNever] = useState(false);
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [shown, setShown] = useState(PAGE);
  const [colModal, setColModal] = useState<{ id: number | null } | null>(null);
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const visibleCols = useMemo(() => cols.filter((c) => !c.hidden), [cols]);
  const rows = useMemo(() => sortContacts(filterContacts(contacts, cols, { q, due: dueOnly, never }, today), cols, sort.key, sort.dir), [contacts, cols, q, dueOnly, never, today, sort]);
  const dueCount = useMemo(() => contacts.reduce((n, c) => n + (isDue(c, today) ? 1 : 0), 0), [contacts, today]);
  const page = rows.slice(0, shown);
  const allOn = page.length > 0 && page.every((c) => selected.has(c.id));

  const selRef = useRef(selected); selRef.current = selected;
  const toggle = useCallback((id: number) => { const s = new Set(selRef.current); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); }, [setSelected]);
  const writeOne = useCallback((id: number) => onWrite([id]), [onWrite]);
  const th = (key: string, label: string, cls = "") => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="ox-th" onClick={() => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
    </th>
  );

  async function importFile(f: File | undefined) {
    if (!f) return; setNote("Importing…");
    try {
      const r = await api<{ added: number; skipped: number; newColumns: string[] }>("/api/admin/outreach/contacts/import", { method: "POST", body: JSON.stringify({ csv: await f.text() }) });
      setNote(`Added ${r.added} contact${r.added === 1 ? "" : "s"}${r.newColumns.length ? `, new columns: ${r.newColumns.join(", ")}` : ""}${r.skipped ? `, skipped ${r.skipped} empty row${r.skipped === 1 ? "" : "s"}` : ""}.`);
      onImported();
    } catch (e) { setNote(e instanceof Error ? e.message : "Import failed."); }
    if (file.current) file.current.value = "";
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const exportList = selected.size ? contacts.filter((c) => selected.has(c.id)) : rows;

  return (
    <section className="ox-sheet" aria-label="Contact list">
      <div className="ox-bar">
        <input className="ox-search" type="search" placeholder={`Search ${contacts.length} contacts…`} value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <button className={"btn" + (dueOnly ? " active" : "")} onClick={() => setDue(!dueOnly)} aria-pressed={dueOnly}>Follow-up due{dueCount ? ` (${dueCount})` : ""}</button>
        <button className={"btn" + (never ? " active" : "")} onClick={() => setNever(!never)} aria-pressed={never}>Never written to</button>
        <span className="ox-spacer" />
        <button className="btn" onClick={() => setColModal({ id: null })}>Columns</button>
        <button className="btn" onClick={() => file.current?.click()}>Import CSV</button>
        <input ref={file} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => download(`contacts-${stamp}.csv`, "text/csv;charset=utf-8", toCsv(exportRows(exportList, cols)))}>Export CSV</button>
        <button className="btn" onClick={() => download(`contacts-${stamp}.json`, "application/json", toJson(exportList, cols))}>JSON</button>
        <button className="btn btn-primary" onClick={onAdd}>+ Contact</button>
      </div>
      {selected.size > 0 && (
        <div className="ox-bar ox-selbar" role="status">
          <b>{selected.size} selected</b>
          <button className="btn btn-primary" onClick={() => onWrite([...selected])}>✉ Write to them</button>
          <button className="btn btn-danger" onClick={async () => { if (confirm(`Delete ${selected.size} contact${selected.size === 1 ? "" : "s"}? Their send history stays.`)) { await onDelete([...selected]); } }}>Delete</button>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {note && <p className="ox-hint" role="status">{note}</p>}
      <div className="ox-scroll">
        <table className="ox-table">
          <thead>
            <tr>
              <th className="ox-sticky0"><input type="checkbox" checked={allOn} onChange={() => { const s = new Set(selected); if (allOn) page.forEach((c) => s.delete(c.id)); else page.forEach((c) => s.add(c.id)); setSelected(s); }} aria-label="Select all shown" /></th>
              {th("name", "Name", "ox-sticky1")}{th("email", "Email")}
              {visibleCols.map((c) => (
                <th key={c.id} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button className="ox-th" onClick={() => setSort((s) => (s.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : { key: null, dir: 1 }) : { key: c.key, dir: 1 }))}>{c.name}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
                  <button className="ox-gear" onClick={() => setColModal({ id: c.id })} aria-label={`Edit column ${c.name}`}>⚙</button>
                </th>
              ))}
              {th("lastSentAt", "Last sent")}{th("sentCount", "Times")}{th("followUpAt", "Follow up")}<th aria-label="Write" />
            </tr>
          </thead>
          <tbody>
            {page.map((c) => <Row key={c.id} c={c} cols={visibleCols} today={today} on={selected.has(c.id)} onPatch={onPatch} onWrite={writeOne} onToggle={toggle} />)}
            {rows.length === 0 && <tr><td colSpan={visibleCols.length + 7} className="ox-empty">{contacts.length === 0 ? "No contacts yet. Add one, or import a CSV exported from Google Sheets." : "Nobody matches."}</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > shown && <button className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more ({rows.length - shown} left)</button>}
      {colModal && <ColumnsModal cols={cols} focusId={colModal.id} onChange={onColumns} onClose={() => setColModal(null)} />}
    </section>
  );
}
