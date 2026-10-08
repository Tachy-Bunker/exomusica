import type { Tally } from "../lib/hypotheses";
import { pText } from "../lib/hypotheses";

/** How answers split. Plain numbers beside the bar, never colour alone. */
export function TallyBar({ t, testable }: { t: Tally; testable: boolean }) {
  const tot = Math.max(1, t.n);
  const names = testable ? ["picked A", "picked B", "can't tell"] : ["supports", "against", "not sure"];
  return (
    <div className="tally" data-testid="tally">
      <div className="tally-bar" role="img" aria-label={`${t.claim} ${names[0]}, ${t.other} ${names[1]}, ${t.unsure} ${names[2]}`}>
        <span className="tally-claim" style={{ flexGrow: t.claim }} /><span className="tally-other" style={{ flexGrow: t.other }} /><span className="tally-unsure" style={{ flexGrow: t.unsure || (t.n ? 0 : tot) }} />
      </div>
      <p className="home-dim tally-nums">{t.claim} {names[0]} · {t.other} {names[1]} · {t.unsure} {names[2]}{t.informative >= 5 ? ` · ${pText(t.p)}` : ""}</p>
    </div>
  );
}
