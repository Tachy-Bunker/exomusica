import { memo, useEffect, useRef, useState } from "react";
import type { CellValue, Col } from "./types";

/** Text-like cell: edits locally, saves when you leave it or press Enter (Escape puts the old value back). */
export function TextCell({ value, type, onSave, placeholder }: { value: string; type: "text" | "number" | "date" | "url" | "email" | "longtext"; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onSave(v); };
  const common = {
    value: v, placeholder, className: "ox-cell-input",
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" && !(type === "longtext" && e.shiftKey)) { e.preventDefault(); (e.target as HTMLElement).blur(); } else if (e.key === "Escape") { setV(value); setTimeout(() => (e.target as HTMLElement).blur()); } },
  };
  if (type === "longtext") return <textarea rows={1} {...common} />;
  return <input {...common} type={type === "url" || type === "email" ? "text" : type} inputMode={type === "number" ? "decimal" : undefined} />;
}

export function Stars({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <span className="ox-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" role="radio" aria-checked={value === i} className={i <= value ? "on" : ""} onClick={() => onSave(value === i ? 0 : i)} aria-label={`${i} of 5`}>★</button>)}
    </span>
  );
}

export function MultiPick({ options, value, onSave }: { options: string[]; value: string[]; onSave: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", off); return () => window.removeEventListener("pointerdown", off);
  }, [open]);
  const toggle = (o: string) => onSave(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="ox-multi" ref={ref}>
      <button type="button" className="ox-cell-input ox-multi-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{value.length ? value.join(", ") : <span className="ox-dim">—</span>}</button>
      {open && <div className="ox-pop" role="listbox">{options.length === 0 ? <em className="ox-dim">No choices yet: add some in the column's settings.</em> : options.map((o) => <label key={o}><input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} /> {o}</label>)}</div>}
    </div>
  );
}

/** One custom cell, by column type. */
export const Cell = memo(function Cell({ col, value, onSet }: { col: Col; value: CellValue; onSet: (key: string, v: string | number | boolean | string[] | null) => void }) {
  const k = col.key;
  switch (col.type) {
    case "checkbox": return <input type="checkbox" checked={value === true} onChange={(e) => onSet(k, e.target.checked)} aria-label={col.name} />;
    case "rating": return <Stars value={Number(value) || 0} onSave={(v) => onSet(k, v || null)} />;
    case "select": return (
      <select className="ox-cell-input" value={typeof value === "string" ? value : ""} onChange={(e) => onSet(k, e.target.value || null)}>
        <option value="">—</option>{col.options.map((o) => <option key={o}>{o}</option>)}
      </select>);
    case "multiselect": return <MultiPick options={col.options} value={Array.isArray(value) ? value : []} onSave={(v) => onSet(k, v)} />;
    case "number": return <TextCell type="number" value={value === null || value === undefined ? "" : String(value)} onSave={(v) => onSet(k, v.trim() === "" ? null : Number(v))} />;
    default: {
      const text = typeof value === "string" ? value : "";
      return (
        <span className="ox-linkcell">
          <TextCell type={col.type as "text"} value={text} onSave={(v) => onSet(k, v.trim() || null)} />
          {col.type === "url" && /^https?:\/\//i.test(text) && <a href={text} target="_blank" rel="noopener noreferrer" title="Open" aria-label="Open link">↗</a>}
        </span>
      );
    }
  }
});
