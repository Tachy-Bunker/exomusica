import { Link } from "react-router-dom";
import { freqOf, showFreq, TYPE_LABEL, type Peek } from "../lib/atlas";
import { setArrival } from "../lib/arrive";
import { usePocketStore } from "../lib/pocketStore";
import { useTerminalStore } from "../lib/terminalStore";
import type { Around } from "../lib/useAtlas";
import { TypeGlyph } from "./Plate";

/**
 * The radio faceplate under the header: a readout of where you are (every thing has a frequency), its name, what it belongs to (the "up" edge),
 * and the buttons for the things you carry and the terminal. It is the same on every page so the site feels like one instrument.
 */
export function Faceplate({ focus, section, around, onAround, aroundCount }: {
  focus: { type: Peek["type"]; id: string } | null;
  section: string | null;
  around: Around | null;
  onAround: () => void;
  aroundCount: number;
}) {
  const pocketCount = usePocketStore((s) => s.items.length);
  const togglePocket = usePocketStore((s) => s.setOpen);
  const pocketOpen = usePocketStore((s) => s.open);
  const showTerminal = useTerminalStore((s) => s.show);
  const readout = focus ? showFreq(freqOf(focus.type, focus.id)) : "---.---";
  const name = focus ? (around?.title ?? focus.id.replace(/-/g, " ")) : (section ?? "exomusica");
  return (
    <div className="faceplate" data-testid="faceplate" role="region" aria-label="Where you are">
      <span className="fp-readout" data-testid="fp-readout" aria-label={focus ? `Frequency ${readout}` : "No frequency"}>{readout}<i aria-hidden="true">MHz</i></span>
      <span className="fp-name" data-testid="fp-name">
        {focus && <span className="fp-kind"><TypeGlyph type={focus.type} size={13} /> {TYPE_LABEL[focus.type]}</span>}
        <b>{name}</b>
      </span>
      {around && around.context.length > 0 && (
        <nav className="fp-up" aria-label="This belongs to">
          <span className="fp-up-label" aria-hidden="true">in</span>
          {around.context.slice(0, 3).map((c) => (
            <Link key={c.key} to={c.href} className="fp-chip" onClick={() => setArrival("top")} data-testid="fp-context">{c.title}</Link>
          ))}
        </nav>
      )}
      <span className="fp-spacer" />
      <button type="button" className="fp-btn fp-around" onClick={onAround} aria-label={`Around here (${aroundCount})`} data-testid="fp-around" disabled={aroundCount === 0}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
        <span className="fp-btn-label">Around</span>{aroundCount > 0 && <em>{aroundCount}</em>}
      </button>
      <button type="button" className="fp-btn" onClick={() => togglePocket(!pocketOpen)} aria-expanded={pocketOpen} aria-label={`Pocket (${pocketCount})`} data-testid="fp-pocket">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h14v9a7 7 0 0 1-14 0z M5 9h14" /></svg>
        <span className="fp-btn-label">Pocket</span>{pocketCount > 0 && <em>{pocketCount}</em>}
      </button>
      <button type="button" className="fp-btn" onClick={() => showTerminal()} aria-label="Open the Master Terminal (Ctrl+K)" title="Master Terminal · Ctrl+K" data-testid="fp-terminal">
        <span aria-hidden="true" className="fp-prompt">›_</span>
      </button>
    </div>
  );
}
