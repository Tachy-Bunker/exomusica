import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { bindAudioElement, useAudioStore } from "../lib/audioStore";
import { PreviousIcon, NextIcon, LoopIcon, LoopOneIcon, ExpandIcon, CollapseIcon } from "./Icons";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    currentTrack,
    queue,
    history,
    shuffle,
    repeatMode,
    isPlaying,
    currentTime,
    duration,
    expanded,
    toggle,
    seek,
    playNext,
    playPrevious,
    toggleShuffle,
    cycleRepeat,
    setExpanded,
    setProgress,
    ended,
  } = useAudioStore();

  useEffect(() => {
    bindAudioElement(audioRef.current);
    return () => bindAudioElement(null);
  }, []);

  // Real measured height, not a guess — every layout consumer (main content
  // padding, the homepage's height calc) reads this instead of assuming a
  // fixed player height, so nothing ever sits hidden behind it regardless
  // of collapsed/expanded state or queue length.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const height = currentTrack ? el.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty("--player-height", `${height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentTrack]);

  return (
    <div className="player-bar" ref={wrapperRef} style={{ display: currentTrack ? "block" : "none" }}>
      {/* This element is created once and never unmounts across route
          changes — that's the entire mechanism behind "playback survives
          navigation". No special persistence logic needed beyond living
          here, in Layout, outside the router's <Outlet />. */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onEnded={ended}
      />

      {currentTrack && (
        <>
          <div className="collapsed">
            <button className="btn" onClick={playPrevious} disabled={history.length === 0} title="Previous (Shift+←)">
              <PreviousIcon size={16} />
            </button>
            <button className="play-toggle" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"} title="Play/Pause (Space)">
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button className="btn" onClick={playNext} disabled={queue.length === 0} title="Next (Shift+→)">
              <NextIcon size={16} />
            </button>
            <div className="track-info" title={`${currentTrack.title} by ${currentTrack.composer}`}>
              <div className="title">{currentTrack.title}</div>
              <div className="origin">
                {currentTrack.composer} —{" "}
                <Link to={`/album/${currentTrack.albumSlug}`}>{currentTrack.albumTitle}</Link>
              </div>
            </div>
            <button className={`btn ${shuffle ? "btn-primary" : ""}`} onClick={toggleShuffle} title="Shuffle">
              🔀
            </button>
            <button className={`btn ${repeatMode !== "off" ? "btn-primary" : ""}`} onClick={cycleRepeat} title="Repeat: off/all/one">
              {repeatMode === "one" ? <LoopOneIcon size={16} /> : <LoopIcon size={16} />}
            </button>
            <button className="btn" onClick={() => setExpanded(!expanded)} title={expanded ? "Collapse" : "Expand"}>
              {expanded ? <CollapseIcon size={16} /> : <ExpandIcon size={16} />}
            </button>
          </div>

          {expanded && (
            <div className="expanded">
              <div className="seek-row">
                <span className="mono">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <span className="mono">{formatTime(duration)}</span>
              </div>
              {currentTrack.bookmarks.length > 0 && (
                <div className="bookmarks">
                  {currentTrack.bookmarks.map((b) => (
                    <button key={b.label + b.timestampSeconds} onClick={() => seek(b.timestampSeconds)}>
                      {b.label} · {formatTime(b.timestampSeconds)}
                    </button>
                  ))}
                </div>
              )}
              {queue.length > 0 && (
                <div style={{ marginTop: "0.6rem" }}>
                  <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)" }}>
                    Up next ({queue.length})
                  </div>
                  <div style={{ maxHeight: 120, overflowY: "auto" }}>
                    {queue.map((t, i) => (
                      <div key={`${t.id}-${i}`} style={{ fontSize: "0.8rem", padding: "0.15rem 0" }}>
                        {t.title} <span style={{ color: "var(--text-dim)" }}>— {t.albumTitle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
