import { useClipPlayer, playClip, stopClip, sameClip } from "../lib/clipPlayer";
import { formatTime, type Clip } from "../lib/clips";

/** Plays one cited slice of an audio file. `compact` is the little ▶ that sits beside a footnote number. */
export function ClipButton({ clip, compact = false }: { clip: Clip; compact?: boolean }) {
  const playing = useClipPlayer((s) => sameClip(s.playing, clip));
  const label = `${formatTime(clip.start)}–${formatTime(clip.end)}`;
  return (
    <button
      type="button"
      className={`clip-btn${compact ? " clip-btn-compact" : ""}${playing ? " playing" : ""}`}
      data-nocite=""
      title={`${playing ? "Stop" : "Play"} ${label}`}
      aria-label={`${playing ? "Stop" : "Play"} audio clip ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (playing) stopClip();
        else playClip(clip);
      }}
    >
      {playing ? "■" : "▶"}
      {!compact && <span> {label}</span>}
    </button>
  );
}
