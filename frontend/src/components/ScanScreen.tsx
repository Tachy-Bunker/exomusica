// The scan screen: the result of a scan, and the logbook entry one level deeper. Drawn over the room, which stands still while it is open.
// Its keys are answered in BranchRoom (Space, B, X); the buttons call the same actions.
import type { Scannable, ShownLore } from "../lib/roomLore";

export interface ScanRes { s: Scannable; sh: ShownLore; view: "result" | "entry" }

/** The first sentence of a text, cut short for the result screen. */
function firstSentence(t: string): string {
  const m = /^[\s\S]*?[.!?](\s|$)/.exec(t), s = (m ? m[0] : t).trim();
  return s.length > 180 ? s.slice(0, 177).trimEnd() + "…" : s;
}

export function ScanScreen({ res, onRead, onBack, onExit }: { res: ScanRes; onRead: () => void; onBack: () => void; onExit: () => void }) {
  const { s, sh, view } = res, entry = view === "entry";
  return (
    <div className={entry ? "scan-screen is-entry" : "scan-screen"} data-testid="scan-screen" data-view={view} role="dialog" aria-label={`Scan: ${sh.title}`}>
      <div className="scan-screen-head"><span>{entry ? "LOGBOOK ENTRY" : "SCAN RESULT"}</span><span>{sh.owner ? "✦ LORE" : "SCANNED"}</span></div>
      <div className="scan-screen-body">
        {s.img ? <div className="scan-screen-img"><img src={`/api/room-textures/${s.img}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div> : null}
        <div className="scan-screen-text"><h3>{sh.title}</h3><p>{entry ? sh.text : firstSentence(sh.text)}</p></div>
      </div>
      <div className="scan-screen-keys">
        {!entry && <button type="button" className="rm-btn" data-testid="scan-logbook" onClick={onRead}>Read entry · Space</button>}
        <button type="button" className="rm-btn" data-testid="scan-back" onClick={onBack}>{entry ? "Back · B" : "Scanner · B"}</button>
        <button type="button" className="rm-btn" data-testid="scan-exit" onClick={onExit}>Combat visor · X</button>
      </div>
    </div>
  );
}
