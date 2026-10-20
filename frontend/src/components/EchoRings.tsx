import { useEffect, useMemo, useRef, useState } from "react";
import { getRMS } from "../lib/audioAnalyser";
import { addRing, makeOnset, type Ring } from "../lib/echo";
import { useAudioStore } from "../lib/audioStore";
import { useClassicMode } from "../lib/classicMode";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rings that leave the playhead on each hit in the music. Always on (there is no switch). About 14 checks a second, at most four rings alive, drawn with transform and opacity only. Nothing runs while paused, hidden or in classic mode. The expanded player renders it; the collapsed one does not. */
export function EchoRings({ pct }: { pct: number }) {
  const playing = useAudioStore((s) => s.isPlaying);
  const classic = useClassicMode((s) => s.classic);
  const [rings, setRings] = useState<Ring[]>([]);
  const id = useRef(0);
  const enabled = playing && !classic && !reduced();
  const onset = useMemo(() => makeOnset(), [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) { setRings([]); return; }
    const t = window.setInterval(() => {
      if (document.hidden) return;
      const s = onset(getRMS(), performance.now());
      if (s > 0) setRings((r) => addRing(r, { id: ++id.current, s }));
    }, 70);
    return () => window.clearInterval(t);
  }, [enabled, onset]);
  if (rings.length === 0) return null;
  return (
    <div className="echo-layer" aria-hidden="true" style={{ left: `${pct}%` }} data-testid="echo-layer">
      {rings.map((r) => <i key={r.id} className="echo-ring" style={{ ["--s" as string]: r.s }} data-testid="echo-ring" onAnimationEnd={() => setRings((x) => x.filter((y) => y.id !== r.id))} />)}
    </div>
  );
}
