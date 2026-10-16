// The scan screen: the result of a scan, and the logbook entry one level deeper. Drawn over the room, which stands still while it is open.
// Its keys are answered in BranchRoom (Enter, B, X); the buttons call the same actions.
import { useEffect, useRef } from "react";
import type { Scannable, ShownLore } from "../lib/roomLore";
import { inscriptionParts, inscriptionPlain } from "../lib/inscription";
import { RoomTile } from "./RoomGlyph";

export interface ScanRes { s: Scannable; sh: ShownLore; view: "result" | "entry" }

/** The first sentence of a text, cut short for the result screen. */
function firstSentence(t: string): string {
  const m = /^[\s\S]*?[.!?](\s|$)/.exec(t), s = (m ? m[0] : t).trim();
  return s.length > 180 ? s.slice(0, 177).trimEnd() + "…" : s;
}

/** The logbook text, with its Log / XenoLab / news links as buttons that open the page in the room's terminal. */
function InscriptionText({ text, room, onSite }: { text: string; room: string; onSite?: (path: string, title: string) => void }) {
  return <>{inscriptionParts(text, room).map((p, i) => ("text" in p ? <span key={i}>{p.text}</span> : onSite ? <button key={i} type="button" className="scan-link" onClick={() => onSite(p.path, p.label)}>{p.label} ↗</button> : <span key={i}>{p.label}</span>))}</>;
}

export function ScanScreen({ res, room, onRead, onBack, onExit, onSite }: { res: ScanRes; room: string; onRead: () => void; onBack: () => void; onExit: () => void; onSite?: (path: string, title: string) => void }) {
  const { s, sh, view } = res, entry = view === "entry";
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keyboard and screen-reader users land on the first action, and the place they came from gets focus back on close.
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    return () => { if (before && before !== document.body && document.contains(before)) before.focus({ preventScroll: true }); };
  }, []);
  return (
    <div ref={root} className={entry ? "scan-screen is-entry" : "scan-screen"} data-testid="scan-screen" data-view={view} role="dialog" aria-label={`Scan: ${sh.title}`}>
      <div className="scan-screen-head"><span>{entry ? "LOGBOOK ENTRY" : "SCAN RESULT"}</span><span>{sh.owner ? "✦ LORE" : "SCANNED"}</span></div>
      <div className="scan-screen-body">
        {s.img ? <div className="scan-screen-img"><img src={`/api/room-textures/${s.img}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div> : null}
        <div className="scan-screen-text"><h3>{sh.title}</h3><p>{entry ? <InscriptionText text={sh.text} room={room} onSite={onSite} /> : firstSentence(inscriptionPlain(sh.text, room))}</p></div>
      </div>
      <div className="scan-screen-keys">
        {!entry && <RoomTile wide icon="book" label="Read entry" keys="Enter" testid="scan-logbook" onClick={onRead} />}
        <RoomTile wide icon="back" label={entry ? "Back" : "Scanner"} keys="B" testid="scan-back" onClick={onBack} />
        <RoomTile wide icon="cross" label="Combat visor" keys="X" testid="scan-exit" onClick={onExit} />
      </div>
    </div>
  );
}
