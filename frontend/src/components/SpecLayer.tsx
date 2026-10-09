import { useEffect, useRef } from "react";
import { STRIP_H, STRIP_W, paintStrip, rampFor, type TrackComment } from "../lib/specStrip";

/** The spectrogram picture, a dimmed "not yet played" cover, and comment pins. Painted once; the playhead only moves a CSS transform. */
export function SpecLayer({ strip, color, pct, comments, duration, onPin, activeId }: {
  strip: Uint8Array; color?: string | null; pct: number; comments: TrackComment[]; duration: number; onPin?: (c: TrackComment) => void; activeId?: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current?.getContext("2d"); if (c) paintStrip(c, strip, rampFor(color ?? null)); }, [strip, color]);
  return (
    <>
      <canvas ref={ref} className="spec-canvas" width={STRIP_W} height={STRIP_H} aria-hidden />
      <div className="spec-unplayed" style={{ transform: `translateX(${Math.min(100, Math.max(0, pct))}%)` }} />
      <div className="spec-head" style={{ left: `${Math.min(100, Math.max(0, pct))}%` }} />
      {duration > 0 && comments.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`spec-pin${activeId === c.id ? " is-active" : ""}`}
          style={{ left: `${Math.min(100, (c.atSeconds / duration) * 100)}%` }}
          title={`${c.user}: ${c.body}`}
          aria-label={`Comment by ${c.user}`}
          onClick={(e) => { e.stopPropagation(); onPin?.(c); }}
        />
      ))}
    </>
  );
}
