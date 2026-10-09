import { showFreq, TYPE_LABEL, freqOf, type Entity } from "../lib/atlas";
import { TypeGlyph } from "./Plate";

/** The list above the composer while typing `#name` or `~7.156`. Controlled by the composer so arrow keys and Tab work from the textarea. */
export function EntityPicker({ hits, sel, onPick, onHover }: { hits: Entity[]; sel: number; onPick: (e: Entity) => void; onHover: (i: number) => void }) {
  if (hits.length === 0) return null;
  return (
    <ul className="ent-picker" role="listbox" aria-label="Things you can link" data-testid="ent-picker">
      {hits.map((e, i) => (
        <li key={`${e.type}:${e.id}`} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onMouseDown={(ev) => { ev.preventDefault(); onPick(e); }} onMouseEnter={() => onHover(i)}>
          <TypeGlyph type={e.type} size={14} /><b>{e.title}</b><span>{TYPE_LABEL[e.type]}</span><i>{showFreq(freqOf(e.type, e.id))}</i>
        </li>
      ))}
    </ul>
  );
}
