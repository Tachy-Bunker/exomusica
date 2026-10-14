import { useEffect, useMemo, useRef, useState } from "react";
import { getRMS } from "../lib/audioAnalyser";
import { addRing, makeOnset, type Ring } from "../lib/echo";
import { useAudioStore } from "../lib/audioStore";
import { useClassicMode } from "../lib/classicMode";
import { useEchoPref } from "../lib/echoPref";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rings that leave the playhead on each hit in the music. About 14 checks a second, at most four rings alive, drawn with transform and opacity only. Nothing runs while paused, hidden, in classic mode or with Echo off. */
export function EchoRings({ pct }: { pct: number }) {
  const playing = useAudioStore((s) => s.isPlaying);
  const classic = useClassicMode((s) => s.classic);
  const pref = useEchoPref((s) => s.on);
  const [rings, setRings] = useState<Ring[]>([]);
  const id = useRef(0);
  const enabled = playing && pref && !classic && !reduced();
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

/** The on/off button for the expanded player. */
export function EchoToggle() {
  const on = useEchoPref((s) => s.on);
  const set = useEchoPref((s) => s.set);
  return <button type="button" className="btn" aria-pressed={on} onClick={() => set(!on)} title="Echo: rings from the playhead on each hit" data-testid="echo-toggle" style={{ fontSize: "0.75rem" }}>Echo</button>;
}
