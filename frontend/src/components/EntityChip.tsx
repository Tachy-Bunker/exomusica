import { showFreq, TYPE_LABEL, type EntityType } from "../lib/atlas";
import { TypeGlyph } from "./Plate";

/** A link to a thing in the Atlas, drawn the way the site draws things: glyph, name, frequency. Clicking goes there like any link. */
export function EntityChip({ type, freq, href, onClick, children }: { type: EntityType; freq: number; href: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <a className="ent-chip" href={href} onClick={onClick} data-type={type} title={`${TYPE_LABEL[type]} · ${showFreq(freq)}`} data-testid="ent-chip">
      <TypeGlyph type={type} size={13} /><span className="ent-chip-name">{children}</span><i>{showFreq(freq)}</i>
    </a>
  );
}
