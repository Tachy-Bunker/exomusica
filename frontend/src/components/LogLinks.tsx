import { Link } from "react-router-dom";
import { useTrailStore } from "../lib/trailStore";
import { useAround } from "../lib/useAtlas";
import { setArrival } from "../lib/arrive";

/** On a study: a way back into the Log. The Log page you came from (if you came from one), and the other Log pages that mention this study. */
export function LogLinks({ studySlug }: { studySlug: string }) {
  const trail = useTrailStore((s) => s.trail);
  const { around } = useAround({ type: "study", id: studySlug });
  const from = trail.find((t) => t.type === "wiki");
  const mentions = (around?.context ?? []).filter((c) => c.type === "wiki" && c.id !== from?.id);
  if (!from && mentions.length === 0) return null;
  return (
    <nav className="log-links" aria-label="Back to the Log" data-testid="log-links">
      {from && <Link to={from.href} className="log-back" onClick={() => setArrival("left")} data-testid="log-back">← {from.title}</Link>}
      {mentions.map((m) => <Link key={m.key} to={m.href} className="log-chip" onClick={() => setArrival("left")} data-testid="log-mention">{m.title}</Link>)}
      <Link to="/wiki" className="log-chip log-all" onClick={() => setArrival("left")}>The Log</Link>
    </nav>
  );
}
