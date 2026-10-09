import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { bindAudioElement, useAudioStore } from "../lib/audioStore";
import { initAnalyser } from "../lib/audioAnalyser";
import { startMediaSession } from "../lib/mediaSession";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useFixedPortalRoot } from "../lib/useFixedPortalRoot";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SpecLayer } from "./SpecLayer";
import { coverColor, loadStrip, nearbyComments, type Strip, type TrackComment } from "../lib/specStrip";
import { PreviousIcon, NextIcon, LoopIcon, LoopOneIcon, ExpandIcon, CollapseIcon, ShuffleIcon, QueueIcon } from "./Icons";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Where a playing track points: its message (for a chat file), its community album, or its album. */
function trackHref(t: { origin?: { href: string } | null; source?: string; albumSlug: string }): string | null {
  if (t.origin) return t.origin.href;
  if (!t.albumSlug) return null;
  return t.source === "community" ? `/community-album/${t.albumSlug}` : `/album/${t.albumSlug}`;
}
const trackLabel = (t: { origin?: { label: string } | null; albumTitle: string }) => (t.origin ? `from ${t.origin.label}` : t.albumTitle);

export function PlayerBar() {
  useEffect(() => { startMediaSession(); }, []); // lock screen / media keys / "now playing" in the OS
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updatePosition() {
      const el = wrapperRef.current;
      if (!el || !window.visualViewport) return;
      const vv = window.visualViewport;
      // How much of the layout viewport's bottom is currently hidden below
      // what's actually visible (e.g. a partially-collapsed address bar) -
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
    currentPlaylist,
    toggle,
    seek,
    playNext,
    playPrevious,
    playQueueIndex,
    toggleShuffle,
    cycleRepeat,
    setExpanded,
    setProgress,
    ended,
  } = useAudioStore();

  const endedFiredRef = useRef(false);

  useEffect(() => {
    endedFiredRef.current = false;
  }, [currentTrack?.id]);

  // The audio element's own .duration sometimes never resolves for some
  // sources (observed with archive.org-hosted files) even though playback
  // itself works fine - falling back to the track's own stored duration
  // means the seek bar still gets a real max instead of 0, which is what
  // was making any seek attempt silently resolve to seeking to position 0
  // (looking exactly like the track restarting).
  const effectiveDuration = duration || currentTrack?.durationSeconds || 0;

  // Real measured height, not a guess - every layout consumer (main content
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
      if ("touches" in ev) ev.preventDefault(); // stop this from also being read as a page scroll/pull-to-refresh gesture
      const clientY = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      const delta = Math.max(0, clientY - startY); // only allow dragging down, not up
      setDragOffset(delta);
    }
    function onUp() {
      setDragging(false);
      setDragOffset((current) => {
        const overlayHeight = overlayRef.current?.getBoundingClientRect().height ?? 600;
        if (current > overlayHeight * 0.3) {
          // Dragged far enough - animate the rest of the way down, then
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
    window.addEventListener("touchmove", onMove, { passive: false });
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
    if (!effectiveDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(frac * effectiveDuration);
  }

  // Spectrogram strip + comments for the current track.
  const trackId = currentTrack?.id ?? null;
  const [strip, setStrip] = useState<Strip | null>(null);
  const [comments, setComments] = useState<TrackComment[]>([]);
  const [pickAt, setPickAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tint, setTint] = useState<string | null>(null); // the cover's average colour: the strip's main colour
  const [cErr, setCErr] = useState("");
  const { user } = useAuth();
  useEffect(() => {
    setStrip(null); setComments([]); setPickAt(null); setActiveId(null); setCErr("");
    if (trackId == null) return;
    let live = true;
    loadStrip(trackId).then((s) => { if (live) setStrip(s); });
    setTint(null); void coverColor(currentTrack?.coverArtUrl).then((c) => { if (live) setTint(c); });
    api<TrackComment[]>(`/api/tracks/${trackId}/comments`).then((c) => { if (live) setComments(Array.isArray(c) ? c : []); }).catch(() => {});
    return () => { live = false; };
  }, [trackId]);
  const spec = strip && strip !== "none" ? strip : null;
  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (trackId == null || !draft.trim()) return;
    try {
      const c = await api<TrackComment>(`/api/tracks/${trackId}/comments`, { method: "POST", body: JSON.stringify({ atSeconds: pickAt ?? currentTime, body: draft }) });
      setComments((l) => [...l, c].sort((a, b) => a.atSeconds - b.atSeconds)); setDraft(""); setCErr(""); setActiveId(c.id);
    } catch (err) { setCErr(err instanceof Error ? err.message : "Couldn't post."); }
  }
  async function removeComment(id: number) {
    if (trackId == null) return;
    await api(`/api/tracks/${trackId}/comments/${id}`, { method: "DELETE" }).catch(() => {});
    setComments((l) => l.filter((c) => c.id !== id)); setActiveId(null);
  }
  function pinClick(c: TrackComment) { setActiveId(c.id); setPickAt(c.atSeconds); seek(c.atSeconds); }
  const at = pickAt ?? currentTime;
  const heard = activeId != null ? comments.filter((c) => c.id === activeId) : nearbyComments(comments, currentTime).slice(0, 2);

  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const progressPct = effectiveDuration ? ((seekPreview ?? currentTime) / effectiveDuration) * 100 : 0;
  const portalRoot = useFixedPortalRoot();

  const content = (
    <div className="player-bar-wrapper" ref={wrapperRef} style={{ display: currentTrack ? "block" : "none" }}>
      {/* This element is created once and never unmounts across route
          changes - that's the entire mechanism behind "playback survives
          navigation". No special persistence logic needed beyond living
          here, in Layout, outside the router's <Outlet />. */}
      <audio
        ref={(el) => {
          audioRef.current = el;
          bindAudioElement(el);
          if (el) {
            try {
              initAnalyser(el);
            } catch (err) {
              console.error("Analyser init failed (visuals only):", err);
            }
          }
        }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onPause={() => useAudioStore.setState({ isPlaying: false })}
        onPlay={() => useAudioStore.setState({ isPlaying: true })}
        onError={(e) => {
          const el = e.currentTarget;
          console.error("Audio playback error:", {
            code: el.error?.code,
            message: el.error?.message,
            networkState: el.networkState,
            src: el.currentSrc,
          });
        }}
        onEnded={() => {
          if (endedFiredRef.current) return;
          endedFiredRef.current = true;
          ended();
        }}
      />

      {currentTrack && !expanded && (
        <div className="player-bar-docked">
          <div className={`player-seek-strip${spec ? " has-spec" : ""}`} onClick={handleSeekStripClick}>
            <div className="player-seek-track">
              {spec ? <SpecLayer strip={spec} color={tint} pct={progressPct} comments={comments} duration={effectiveDuration} activeId={activeId} onPin={pinClick} /> : <div className="player-seek-fill" style={{ width: `${progressPct}%` }} />}
            </div>
          </div>
          <div
            className={`player-bar-row${isDesktop && currentPlaylist ? " player-bar-row--tall" : ""}`}
            ref={rowRef}
            onClick={handleRowClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Link
              to={trackHref(currentTrack) ?? "#"}
              className="player-cover"
              style={{ backgroundImage: currentTrack.coverArtUrl ? `url(${currentTrack.coverArtUrl})` : undefined }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="track-info" title={`${currentTrack.title} by ${currentTrack.composer}`}>
              <div className="title">{currentTrack.title}</div>
              {isDesktop && (
                <div className="origin">
                  {currentTrack.composer ? <>{currentTrack.composer} -{" "}</> : null}
                  {trackHref(currentTrack) ? <Link to={trackHref(currentTrack)!} onClick={(e) => e.stopPropagation()}>{trackLabel(currentTrack)}</Link> : trackLabel(currentTrack)}
                </div>
              )}
              {isDesktop && currentPlaylist && (
                <div className="origin">
                  from:{" "}
                  <Link to={`/playlist/${currentPlaylist.slug}`} onClick={(e) => e.stopPropagation()}>
                    {currentPlaylist.title}
                  </Link>
                </div>
              )}
            </div>

            <div className="player-transport">
              {!isDesktop && currentPlaylist && (
                <Link to={`/playlist/${currentPlaylist.slug}`} className="btn player-queue-indicator" onClick={(e) => e.stopPropagation()} title={`Playing from: ${currentPlaylist.title}`}>
                  <QueueIcon size={15} />
                </Link>
              )}
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
          onClick={() => setExpanded(false)}
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
              {currentTrack.composer ? <>{currentTrack.composer} -{" "}</> : null}
              {trackHref(currentTrack) ? <Link to={trackHref(currentTrack)!} onClick={() => setExpanded(false)}>{trackLabel(currentTrack)}</Link> : trackLabel(currentTrack)}
            </p>
            {currentPlaylist && (
              <p style={{ color: "var(--text-dim)", marginTop: "-0.4rem" }}>
                from:{" "}
                <Link to={`/playlist/${currentPlaylist.slug}`} onClick={() => setExpanded(false)}>
                  {currentPlaylist.title}
                </Link>
              </p>
            )}

            <div className="seek-row">
              <span className="mono">{formatTime(seekPreview ?? currentTime)}</span>
              <div className={`player-seek-strip player-seek-strip--expanded${spec ? " has-spec" : ""}`} onClick={(e) => { e.stopPropagation(); handleSeekStripClick(e); if (effectiveDuration) { const r = e.currentTarget.getBoundingClientRect(); setPickAt(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * effectiveDuration); setActiveId(null); } }}>
                <div className="player-seek-track">
                  {spec ? <SpecLayer strip={spec} color={tint} pct={progressPct} comments={comments} duration={effectiveDuration} activeId={activeId} onPin={pinClick} /> : <div className="player-seek-fill" style={{ width: `${progressPct}%` }} />}
                </div>
              </div>
              <span className="mono">{formatTime(effectiveDuration)}</span>
            </div>
            <div className="spec-caption" data-testid="spec-caption" onClick={(e) => e.stopPropagation()}>
              {heard.map((c) => (
                <div key={c.id}><b>{c.user}</b> <span className="mono">{formatTime(c.atSeconds)}</span> {c.body}
                  {user && (user.id === c.userId || user.isAdmin) && <button onClick={() => removeComment(c.id)} aria-label="Delete comment" title="Delete">x</button>}
                </div>
              ))}
            </div>
            <form className="spec-comment" onClick={(e) => e.stopPropagation()} onSubmit={postComment}>
              <span className="mono" title="Click the strip to choose the moment">@{formatTime(at)}</span>
              <input className="input" value={draft} maxLength={240} disabled={!user} onChange={(e) => setDraft(e.target.value)} placeholder={user ? "Comment on this moment (click the strip to choose it)" : "Log in to comment"} aria-label="Comment on this moment" />
              <button className="btn btn-primary" disabled={!user || !draft.trim()}>Post</button>
            </form>
            {cErr && <div className="spec-caption" role="alert">{cErr}</div>}

            <div className="player-transport" style={{ justifyContent: "center", marginTop: "0.8rem" }} onClick={(e) => e.stopPropagation()}>
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
              <div className="bookmarks" style={{ marginTop: "0.8rem" }} onClick={(e) => e.stopPropagation()}>
                {currentTrack.bookmarks.map((b) => (
                  <button key={b.label + b.timestampSeconds} onClick={() => seek(b.timestampSeconds)}>
                    {b.label} · {formatTime(b.timestampSeconds)}
                  </button>
                ))}
              </div>
            )}

            {queue.length > 0 && (
              <div style={{ marginTop: "1.2rem", width: "100%", maxWidth: 480, opacity: 0.35 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                  Up next ({queue.length})
                </div>
                <div style={{ maxHeight: "30vh", overflowY: "auto" }}>
                  {queue.map((t, i) => (
                    <div
                      key={`${t.id}-${i}`}
                      className="player-queue-row"
                      onClick={() => playQueueIndex(i)}
                      style={{ fontSize: "0.85rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      {t.title} <span style={{ color: "var(--text-dim)" }}>- {t.albumTitle}</span>
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

  // Portal escapes the app-root's chromatic-aberration filter wrapper -
  // CSS filter on an ancestor changes the containing block for
  // position:fixed descendants, which was making this bar/overlay
  // position and size relative to that wrapper instead of the true
  // viewport (most visible as the expanded view not properly filling the
  // screen on pages with unusual content height, like branch pages).
  return portalRoot ? createPortal(content, portalRoot) : content;
}
