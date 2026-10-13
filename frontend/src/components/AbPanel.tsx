import { useAudioStore, type AbEntry } from "../lib/audioStore";
import type { AbSlot } from "../lib/playTransition";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** The A/B pair: two stretches (even of different tracks), flipped with one key (\). Both loop. */
export function AbPanel() {
  const ab = useAudioStore((s) => s.ab);
  const { abMark, abClear, abPlay, abFlip, abStop } = useAudioStore.getState();
  const row = (slot: AbSlot, e: AbEntry | null) => (
    <div className={`ab-row${ab.active === slot ? " on" : ""}`} data-testid={`ab-${slot}`}>
      <b>{slot}</b>
      <span className="ab-what">{e ? <>{e.track.title} <span className="mono">{fmt(e.start)}–{fmt(e.end)}</span></> : <i>nothing marked</i>}</span>
      <button className="btn" onClick={() => abMark(slot, "start")} title="Start at the current moment">in</button>
      <button className="btn" onClick={() => abMark(slot, "end")} title="End at the current moment">out</button>
      <button className="btn" disabled={!e} onClick={() => abPlay(slot)} title="Play this stretch on a loop">▶</button>
      <button className="btn" disabled={!e} onClick={() => abClear(slot)} title="Clear" aria-label={`Clear ${slot}`}>×</button>
    </div>
  );
  return (
    <div className="ab-panel" onClick={(e) => e.stopPropagation()} data-testid="ab-panel">
      <div className="ab-head">
        <span>A / B compare</span>
        <span className="ab-keys">
          <button className="btn" disabled={!ab.A && !ab.B} onClick={abFlip} title="Flip to the other side (\)" data-testid="ab-flip">flip <kbd>\</kbd></button>
          {ab.active && <button className="btn" onClick={abStop} title="Stop looping and play on normally">free</button>}
        </span>
      </div>
      {row("A", ab.A)}
      {row("B", ab.B)}
    </div>
  );
}

/** The marked stretch of the current track, drawn over the seek strip. */
export function AbRegions({ duration }: { duration: number }) {
  const ab = useAudioStore((s) => s.ab);
  const cur = useAudioStore((s) => s.currentTrack);
  if (!cur || !duration) return null;
  return (
    <>
      {(["A", "B"] as const).map((slot) => {
        const e = ab[slot];
        if (!e || e.track.id !== cur.id || e.track.source !== cur.source) return null;
        return <div key={slot} className={`ab-region ab-${slot}${ab.active === slot ? " on" : ""}`} style={{ left: `${(e.start / duration) * 100}%`, width: `${((e.end - e.start) / duration) * 100}%` }}><span>{slot}</span></div>;
      })}
    </>
  );
}
