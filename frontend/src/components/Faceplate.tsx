import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLensStore } from "../lib/lensStore";
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
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    const ask = () => api<{ n: number }>("/api/letters/unread").then((r) => setUnread(r.n)).catch(() => {});
    void ask();
    const t = window.setInterval(ask, 120_000);
    window.addEventListener("exomusica:letters", ask);
    return () => { clearInterval(t); window.removeEventListener("exomusica:letters", ask); };
  }, [user]);
  const pocketCount = usePocketStore((s) => s.items.length);
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
        <button type="button" className={`fp-btn${lens.on ? " fp-on" : ""}`} onClick={lens.toggle} aria-pressed={lens.on} aria-label="Trace lens: show the marks people left here" aria-describedby="fp-lens-tip" data-testid="fp-lens">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg>
          <span className="fp-btn-label">Trace</span>{lens.on && <i className="fp-state">on</i>}
        </button>
        <span id="fp-lens-tip" role="tooltip" className="fp-tip" data-testid="fp-lens-tip"><b>Trace lens</b> Members can leave small drawn marks on a place (a branch, an album, a study...). Switch this on to see the ones left on the page you are on. They fade after a while. {lens.on ? "It is on now." : "It is off, so pages stay clean."}</span>
      </span>
      {user && <Link to="/letters" className="fp-btn" aria-label={`Letters${unread ? ` (${unread} unread)` : ""}`} data-testid="fp-letters">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        <span className="fp-btn-label">Letters</span>{unread > 0 && <em>{unread}</em>}
      </Link>}
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
