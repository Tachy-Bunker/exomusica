import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLensStore } from "../lib/lensStore";
import { useProfileStore } from "../lib/profileStore";
import { allowDrop, dropToPocket, useDragStore } from "./PocketPad";
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
export function Faceplate({ focus, section, around, onAround, aroundCount, center }: {
  center?: React.ReactNode;
  focus: { type: Peek["type"]; id: string } | null;
  section: string | null;
  around: Around | null;
  onAround: () => void;
  aroundCount: number;
}) {
  const { user } = useAuth();
  const lens = useLensStore();
  const [unread, setUnread] = useState(0);
  const unreadPms = useProfileStore((s) => s.unreadPms);
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    const ask = () => api<{ n: number }>("/api/letters/unread").then((r) => setUnread(Number(r?.n) || 0)).catch(() => {});
    void ask();
    const t = window.setInterval(ask, 120_000);
    window.addEventListener("exomusica:letters", ask);
    return () => { clearInterval(t); window.removeEventListener("exomusica:letters", ask); };
  }, [user]);
  const pocketCount = usePocketStore((s) => s.items.length);
  const dragging = useDragStore((s) => !!s.active);
  const togglePocket = usePocketStore((s) => s.setOpen);
  const pocketOpen = usePocketStore((s) => s.open);
  const showTerminal = useTerminalStore((s) => s.show);
  const readout = focus ? showFreq(freqOf(focus.type, focus.id)) : "---.---";
  const name = focus ? (around?.title ?? focus.id.replace(/-/g, " ")) : (section ?? "exomusica");
  return (
    <div className={`faceplate${center ? " has-center" : ""}`} data-testid="faceplate" role="region" aria-label="Where you are">
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
      {center}
      {center && <span className="fp-spacer" />}
      <button type="button" className="fp-btn fp-around" onClick={onAround} aria-label={`Around here (${aroundCount})`} data-testid="fp-around" disabled={aroundCount === 0}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
        <span className="fp-btn-label">Around</span>{aroundCount > 0 && <em>{aroundCount}</em>}
      </button>
      <span className="fp-tipwrap">
        <button type="button" className={`fp-btn${lens.on ? " fp-on" : ""}`} onClick={lens.toggle} aria-pressed={lens.on} aria-label="Scan Visor: show what travellers left here" aria-describedby="fp-lens-tip" data-testid="fp-lens">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" opacity=".6" /><g className={lens.on ? "lens-pulse" : undefined}><path d="M12 12L12 3" /></g><circle cx="16.5" cy="8" r="1.1" fill="currentColor" stroke="none" /></svg>
          <span className="fp-btn-label">Scan</span>{lens.on && <i className="fp-state">on</i>}
        </button>
        <span id="fp-lens-tip" role="tooltip" className="fp-tip" data-testid="fp-lens-tip"><b>Scan Visor</b> Travellers leave traces on places: notes written right on the page, or small drawings. Switch the visor on to see the traces in the sector you are in, and write your own anywhere. Traces fade after a while. {lens.on ? "Scanning now." : "Off, so pages stay clean."}</span>
      </span>
      {user && <Link to="/pms" className="fp-btn" aria-label={`Post${unread + unreadPms ? ` (${unread + unreadPms} unread)` : ""}`} data-testid="fp-post">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        <span className="fp-btn-label">Post</span>{unread + unreadPms > 0 && <em>{unread + unreadPms}</em>}
      </Link>}
      <button type="button" className={`fp-btn${dragging ? " fp-drop-hot" : ""}`} onDragOver={allowDrop} onDrop={dropToPocket} onClick={() => togglePocket(!pocketOpen)} aria-expanded={pocketOpen} aria-label={`Pocket (${pocketCount})`} data-testid="fp-pocket">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h14v9a7 7 0 0 1-14 0z M5 9h14" /></svg>
        <span className="fp-btn-label">Pocket</span>{pocketCount > 0 && <em>{pocketCount}</em>}
      </button>
      <button type="button" className="fp-btn" onClick={() => showTerminal()} aria-label="Open the Master Terminal (Ctrl+K)" title="Master Terminal · Ctrl+K" data-testid="fp-terminal">
        <span aria-hidden="true" className="fp-prompt">›_</span>
      </button>
    </div>
  );
}
