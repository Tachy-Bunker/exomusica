import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { bindAudioElement, useAudioStore } from "../lib/audioStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useFixedPortalRoot } from "../lib/useFixedPortalRoot";
import { PreviousIcon, NextIcon, LoopIcon, LoopOneIcon, ExpandIcon, CollapseIcon, ShuffleIcon } from "./Icons";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updatePosition() {
      const el = wrapperRef.current;
      if (!el || !window.visualViewport) return;
      const vv = window.visualViewport;
      // How much of the layout viewport's bottom is currently hidden below
      // what's actually visible (e.g. a partially-collapsed address bar) —
      // position:fixed;bottom:0 alone anchors to the layout viewport on
      // some mobile browsers, not the visual one, which is what put the
      // player off-screen below the real visible area.
      const hiddenBelow = window.innerHeight - (vv.height + vv.offsetTop);
      el.style.bottom = `${Math.max(0, hiddenBelow)}px`;
    }
    updatePosition();
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);
  const rowRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
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
  // of collapsed/expanded state or queue length. The expanded overlay is a
  // fixed-position layer of its own (doesn't push layout), so height is
  // only measured for the docked bar.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || expanded) {
      if (expanded) document.documentElement.style.setProperty("--player-height", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      const height = currentTrack ? el.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty("--player-height", `${height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentTrack, expanded]);

  // Mobile-only: lock body scroll while the player is expanded, since it's
  // a full-viewport overlay and background scroll would otherwise still
  // be reachable underneath it.
  useEffect(() => {
    if (!expanded || isDesktop) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded, isDesktop]);

  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayDragStart(e: React.MouseEvent | React.TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setDragging(true);

    function onMove(ev: MouseEvent | TouchEvent) {
      const clientY = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      const delta = Math.max(0, clientY - startY); // only allow dragging down, not up
      setDragOffset(delta);
    }
    function onUp() {
      setDragging(false);
      setDragOffset((current) => {
        const overlayHeight = overlayRef.current?.getBoundingClientRect().height ?? 600;
        if (current > overlayHeight * 0.3) {
          // Dragged far enough — animate the rest of the way down, then
          // actually collapse once that animation would be done.
          setTimeout(() => setExpanded(false), 200);
          return overlayHeight;
        }
        return 0; // snap back
      });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }

  useEffect(() => {
    setDragOffset(0);
  }, [expanded]);

  // Click/swipe-to-expand: any part of the docked row that isn't a button
  // or link expands the player. Buttons/links stopPropagation on their own
  // clicks so this only fires for genuine "tap the bar" gestures.
  const touchStartY = useRef<number | null>(null);
  function handleRowClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    setExpanded(true);
  }
  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    touchStartY.current = null;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    if (dy > 40) setExpanded(true); // swiped up
  }

  function handleSeekStripClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(frac * duration);
  }

  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const progressPct = duration ? ((seekPreview ?? currentTime) / duration) * 100 : 0;
  const portalRoot = useFixedPortalRoot();

  const content = (
    <div className="player-bar-wrapper" ref={wrapperRef} style={{ display: currentTrack ? "block" : "none" }}>
      {/* This element is created once and never unmounts across route
          changes — that's the entire mechanism behind "playback survives
          navigation". No special persistence logic needed beyond living
          here, in Layout, outside the router's <Outlet />. */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onPause={() => useAudioStore.setState({ isPlaying: false })}
        onPlay={() => useAudioStore.setState({ isPlaying: true })}
        onEnded={ended}
      />

      {currentTrack && !expanded && (
        <div className="player-bar-docked">
          <div className="player-seek-strip" onClick={handleSeekStripClick}>
            <div className="player-seek-track">
              <div className="player-seek-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div
            className="player-bar-row"
            ref={rowRef}
            onClick={handleRowClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Link
              to={`/album/${currentTrack.albumSlug}`}
              className="player-cover"
              style={{ backgroundImage: currentTrack.coverArtUrl ? `url(${currentTrack.coverArtUrl})` : undefined }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="track-info" title={`${currentTrack.title} by ${currentTrack.composer}`}>
              <div className="title">{currentTrack.title}</div>
              {isDesktop && (
                <div className="origin">
                  {currentTrack.composer} —{" "}
                  <Link to={`/album/${currentTrack.albumSlug}`} onClick={(e) => e.stopPropagation()}>
                    {currentTrack.albumTitle}
                  </Link>
                </div>
              )}
            </div>

            <div className="player-transport">
              {isDesktop && (
                <button className={`btn ${shuffle ? "btn-primary" : ""}`} onClick={toggleShuffle} title="Shuffle (P)">
                  <ShuffleIcon size={16} />
                </button>
              )}
              <button className="btn" onClick={playPrevious} disabled={history.length === 0} title="Previous (Shift+←)">
                <PreviousIcon size={16} />
              </button>
              <button className="play-toggle" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"} title="Play/Pause (Space)">
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button className="btn" onClick={playNext} disabled={queue.length === 0} title="Next (Shift+→)">
                <NextIcon size={16} />
              </button>
              {isDesktop && (
                <button className={`btn ${repeatMode !== "off" ? "btn-primary" : ""}`} onClick={cycleRepeat} title="Repeat: off/all/one">
                  {repeatMode === "one" ? <LoopOneIcon size={16} /> : <LoopIcon size={16} />}
                </button>
              )}
            </div>

            {isDesktop && (
              <button className="btn player-expand-btn" onClick={() => setExpanded(true)} title="Expand">
                <ExpandIcon size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {currentTrack && expanded && (
        <div
          className="player-expanded-overlay"
          ref={overlayRef}
          onMouseDown={handleOverlayDragStart}
          onTouchStart={handleOverlayDragStart}
          style={{
            transform: `translateY(${dragOffset}px)`,
            opacity: 1 - dragOffset / 800,
            transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
          }}
        >
          <button className="btn player-expand-btn" style={{ position: "absolute", top: "1rem", right: "1rem" }} onClick={() => setExpanded(false)} title="Collapse">
            <CollapseIcon size={16} />
          </button>
          <div className="player-expanded-content">
            <div
              className="player-expanded-cover"
              style={{ backgroundImage: currentTrack.coverArtUrl ? `url(${currentTrack.coverArtUrl})` : undefined }}
            />
            <h2 style={{ marginBottom: "0.2rem" }}>{currentTrack.title}</h2>
            <p style={{ color: "var(--text-dim)" }}>
              {currentTrack.composer} —{" "}
              <Link to={`/album/${currentTrack.albumSlug}`} onClick={() => setExpanded(false)}>
                {currentTrack.albumTitle}
              </Link>
            </p>

            <div className="seek-row">
              <span className="mono">{formatTime(seekPreview ?? currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={seekPreview ?? currentTime}
                onChange={(e) => setSeekPreview(Number(e.target.value))}
                onMouseUp={(e) => {
                  seek(Number((e.target as HTMLInputElement).value));
                  setSeekPreview(null);
                }}
                onTouchEnd={(e) => {
                  seek(Number((e.target as HTMLInputElement).value));
                  setSeekPreview(null);
                }}
              />
              <span className="mono">{formatTime(duration)}</span>
            </div>

            <div className="player-transport" style={{ justifyContent: "center", marginTop: "0.8rem" }}>
              <button className={`btn ${shuffle ? "btn-primary" : ""}`} onClick={toggleShuffle} title="Shuffle (P)">
                <ShuffleIcon size={18} />
              </button>
              <button className="btn" onClick={playPrevious} disabled={history.length === 0} title="Previous (Shift+←)">
                <PreviousIcon size={18} />
              </button>
              <button className="play-toggle" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"} title="Play/Pause (Space)">
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button className="btn" onClick={playNext} disabled={queue.length === 0} title="Next (Shift+→)">
                <NextIcon size={18} />
              </button>
              <button className={`btn ${repeatMode !== "off" ? "btn-primary" : ""}`} onClick={cycleRepeat} title="Repeat: off/all/one">
                {repeatMode === "one" ? <LoopOneIcon size={18} /> : <LoopIcon size={18} />}
              </button>
            </div>

            {currentTrack.bookmarks.length > 0 && (
              <div className="bookmarks" style={{ marginTop: "0.8rem" }}>
                {currentTrack.bookmarks.map((b) => (
                  <button key={b.label + b.timestampSeconds} onClick={() => seek(b.timestampSeconds)}>
                    {b.label} · {formatTime(b.timestampSeconds)}
                  </button>
                ))}
              </div>
            )}

            {queue.length > 0 && (
              <div style={{ marginTop: "1.2rem", width: "100%", maxWidth: 480, opacity: 0.35 }}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                  Up next ({queue.length})
                </div>
                <div style={{ maxHeight: "30vh", overflowY: "auto" }}>
                  {queue.map((t, i) => (
                    <div key={`${t.id}-${i}`} style={{ fontSize: "0.85rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                      {t.title} <span style={{ color: "var(--text-dim)" }}>— {t.albumTitle}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Portal escapes the app-root's chromatic-aberration filter wrapper —
  // CSS filter on an ancestor changes the containing block for
  // position:fixed descendants, which was making this bar/overlay
  // position and size relative to that wrapper instead of the true
  // viewport (most visible as the expanded view not properly filling the
  // screen on pages with unusual content height, like branch pages).
  return portalRoot ? createPortal(content, portalRoot) : content;
}
