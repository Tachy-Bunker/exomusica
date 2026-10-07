import { useEffect, useMemo, useState } from "react";
import { useAudioStore } from "../lib/audioStore";
import { useToastStore } from "../lib/toastStore";
import { buildShareUrl, embedSnippet, formatTimestamp, parseTimestamp, setAutoplayParams, setMapShareParams, shareFromGenreState, trackRefParam } from "../lib/shareState";
import type { ShareTrack } from "./ShareAutoplay";

type GenreState = Record<string, "on" | "highlight" | "off">;
interface Props {
  /** The page being shared, e.g. /playlist/night-drive */
  pathname: string;
  /** Where an embeddable version lives (the playlist maps); leave out if the page can't be embedded. */
  embedPath?: string;
  /** The songs a link can start. */
  tracks: ShareTrack[];
  /** On a playlist map: which genres are soloed or off right now, which a link can carry. */
  genreState?: GenreState;
  /** On a playlist map: which view is showing. */
  view?: "map" | "venn";
  title?: string;
  onClose: () => void;
}

/**
 * "Share this": makes a link to exactly what is on screen (the view, which genres are soloed or off), optionally to a song and a moment in
 * it, optionally starting to play; and, for the playlist maps, the code to embed the same thing in another page.
 */
export function ShareModal({ pathname, embedPath, tracks, genreState, view: initialView = "map", title = "Share this", onClose }: Props) {
  const audio = useAudioStore.getState();
  const playingHere = audio.currentTrack ? tracks.find((t) => t.id === audio.currentTrack!.id && (t.source === "community") === (audio.currentTrack!.source === "community")) : undefined;
  const isMap = genreState !== undefined;
  const genres = useMemo(() => shareFromGenreState(genreState ?? {}), [genreState]);
  const hasGenreState = genres.solo.length + genres.off.length > 0;
  const [view, setView] = useState<"map" | "venn">(initialView);
  const [withGenres, setWithGenres] = useState(true);
  const [trackKey, setTrackKey] = useState(playingHere ? trackRefParam(playingHere) : "");
  const [timeText, setTimeText] = useState(playingHere && audio.currentTime >= 1 ? formatTimestamp(audio.currentTime) : "");
  const [play, setPlay] = useState(!!playingHere);
  const [hideControls, setHideControls] = useState(true);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = tracks.find((t) => trackRefParam(t) === trackKey) ?? null;
  const time = parseTimestamp(timeText);
  const timeBad = timeText.trim() !== "" && time === null;
  const origin = window.location.origin;
  const mapParams = (embed: boolean) => {
    const p = new URLSearchParams();
    if (isMap || embed) setMapShareParams(p, { view, solo: isMap && withGenres ? genres.solo : [], off: isMap && withGenres ? genres.off : [], hideControls: embed && hideControls });
    setAutoplayParams(p, { play: !!chosen && play, track: chosen, t: time });
    return p;
  };
  const link = buildShareUrl(origin, pathname, mapParams(false));
  const embedUrl = embedPath ? buildShareUrl(origin, embedPath, mapParams(true)) : "";

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(
      () => useToastStore.getState().showToast(`${what} copied ✓`),
      () => useToastStore.getState().showToast("Couldn't copy: select the text and copy it yourself"),
    );
  }
  function useCurrentPosition() {
    const a = useAudioStore.getState();
    if (!a.currentTrack) return;
    const t = tracks.find((x) => x.id === a.currentTrack!.id && (x.source === "community") === (a.currentTrack!.source === "community"));
    if (t) setTrackKey(trackRefParam(t));
    setTimeText(a.currentTime >= 1 ? formatTimestamp(a.currentTime) : "");
    setPlay(true);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "0.5rem" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} data-testid="share-modal" className="share-modal" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", maxWidth: 560, width: "100%", maxHeight: "92dvh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>

        {(isMap || embedPath) && (
          <fieldset className="share-group">
            <legend>View</legend>
            <div role="group" aria-label="View" style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className={`btn${view === "map" ? " btn-primary" : ""}`} aria-pressed={view === "map"} onClick={() => setView("map")} data-testid="share-view-map">Spacemap</button>
              <button type="button" className={`btn${view === "venn" ? " btn-primary" : ""}`} aria-pressed={view === "venn"} onClick={() => setView("venn")} data-testid="share-view-venn">Constellation</button>
            </div>
          </fieldset>
        )}

        {isMap && (
          <label className="share-row" data-testid="share-genres-row">
            <input type="checkbox" checked={withGenres} onChange={(e) => setWithGenres(e.target.checked)} data-testid="share-genres" disabled={!hasGenreState} />
            <span>
              Keep the genre switches
              <span className="home-dim" data-testid="share-genres-summary">{hasGenreState ? ` (${[genres.solo.length ? `soloed: ${genres.solo.join(", ")}` : "", genres.off.length ? `off: ${genres.off.join(", ")}` : ""].filter(Boolean).join("; ")})` : " (none are soloed or off right now: set some on the map first)"}</span>
            </span>
          </label>
        )}

        <fieldset className="share-group">
          <legend>A song</legend>
          <label className="share-row" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="home-dim">Song</span>
            <select value={trackKey} onChange={(e) => { setTrackKey(e.target.value); if (e.target.value) setPlay(true); }} aria-label="Song to link to" data-testid="share-track" style={{ flex: 1, minWidth: 0 }}>
              <option value="">No particular song</option>
              {tracks.map((t) => <option key={trackRefParam(t)} value={trackRefParam(t)}>{t.title}{t.composer ? ` · ${t.composer}` : ""}</option>)}
            </select>
          </label>
          <div className="share-row" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="home-dim">From</span>
              <input value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="0:00" aria-label="Start at (for example 1:23)" aria-invalid={timeBad} disabled={!chosen} data-testid="share-time" style={{ width: "6rem" }} />
            </label>
            <button type="button" className="btn" onClick={useCurrentPosition} disabled={!audio.currentTrack && !useAudioStore.getState().currentTrack} data-testid="share-now">Use what's playing now</button>
            {timeBad && <span role="alert" style={{ color: "var(--accent-danger)", fontSize: "0.82rem" }} data-testid="share-time-error">Write it like 1:23 or 83</span>}
          </div>
          <label className="share-row"><input type="checkbox" checked={play && !!chosen} disabled={!chosen} onChange={(e) => setPlay(e.target.checked)} data-testid="share-play" /> <span>Start playing when the link is opened <span className="home-dim">(a visitor arriving from outside gets a one-tap Play button, because browsers don't allow sound until someone taps)</span></span></label>
        </fieldset>

        <label className="share-out">Link
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()} data-testid="share-link" style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }} />
            <button type="button" className="btn btn-primary" onClick={() => copy(link, "Link")} data-testid="share-copy-link">Copy</button>
            <a className="btn" href={link} target="_blank" rel="noopener noreferrer" data-testid="share-open">Open</a>
          </div>
        </label>

        {embedPath && (
          <div className="share-embed">
            <h4 style={{ margin: "0.9rem 0 0.3rem" }}>Embed</h4>
            <label className="share-row"><input type="checkbox" checked={hideControls} onChange={(e) => setHideControls(e.target.checked)} data-testid="share-hide-controls" /> <span>Hide the controls (view buttons, settings): just the picture and the player</span></label>
            <div className="share-row" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <label>Width <input type="number" min={200} max={4000} value={size.width} onChange={(e) => setSize((s) => ({ ...s, width: Number(e.target.value) || 800 }))} style={{ width: "5rem" }} data-testid="share-width" /></label>
              <label>Height <input type="number" min={150} max={4000} value={size.height} onChange={(e) => setSize((s) => ({ ...s, height: Number(e.target.value) || 600 }))} style={{ width: "5rem" }} data-testid="share-height" /></label>
            </div>
            <textarea readOnly value={embedSnippet(embedUrl, size)} rows={3} onClick={(e) => (e.target as HTMLTextAreaElement).select()} data-testid="share-embed" style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.4rem" }}>
              <button type="button" className="btn" onClick={() => copy(embedSnippet(embedUrl, size), "Embed code")} data-testid="share-copy-embed">Copy embed code</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.8rem" }}>
          <button type="button" className="btn" onClick={onClose} data-testid="share-close">Close</button>
        </div>
      </div>
    </div>
  );
}
