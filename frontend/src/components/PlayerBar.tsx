import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { bindAudioElement, useAudioStore } from "../lib/audioStore";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentTrack, isPlaying, currentTime, duration, expanded, toggle, seek, setExpanded, setProgress, ended } =
    useAudioStore();

  useEffect(() => {
    bindAudioElement(audioRef.current);
    return () => bindAudioElement(null);
  }, []);

  return (
    <div className="player-bar" style={{ display: currentTrack ? "block" : "none" }}>
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
            <button
              className="play-toggle"
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <div className="track-info">
              <div className="title">{currentTrack.title}</div>
              <div className="origin">
                {currentTrack.composer} —{" "}
                <Link to={`/album/${currentTrack.albumSlug}`}>{currentTrack.albumTitle}</Link>
              </div>
            </div>
            <button className="btn" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Collapse" : "Expand"}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
