import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "./Icons";
import { useAudioStore } from "../lib/audioStore";
import { formatTimestamp, sameTrack, type AutoplayRequest } from "../lib/shareState";

export interface ShareTrack { id: number; source?: string | null; title: string; composer?: string | null }

/**
 * Makes a link that says "play this song from here" do that. Browsers don't allow sound until the visitor has done something on the page,
 * so: if they already have (they clicked a link inside the site), it starts at once; if not (they arrived straight from a shared link, or
 * the browser still refuses), a small prompt asks for one tap and then plays from the right moment.
 */
export function ShareAutoplay({ ready, tracks, request, start }: { ready: boolean; tracks: ShareTrack[]; request: AutoplayRequest; start: (index: number, t: number | null) => void }) {
  const handled = useRef(false);
  const mounted = useRef(true);
  const [prompt, setPrompt] = useState(false);
  const playBtn = useRef<HTMLButtonElement>(null);
  const found = request.track ? tracks.findIndex((t) => sameTrack(t, request.track!)) : 0;
  const index = Math.max(0, found); // a song that has since been removed falls back to the first one
  const target = tracks[index];

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (!ready || !request.play || handled.current || tracks.length === 0) return;
    handled.current = true;
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;
    if (!activated) { setPrompt(true); return; }
    start(index, request.t);
    window.setTimeout(() => { if (mounted.current && !useAudioStore.getState().isPlaying) setPrompt(true); }, 900); // the browser said no after all
  }, [ready, request.play, tracks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prompt) playBtn.current?.focus(); }, [prompt]);

  if (!prompt || !target) return null;
  return (
    <div className="share-prompt" role="dialog" aria-label="Start playing" data-testid="share-prompt">
      <button ref={playBtn} type="button" className="btn btn-primary share-prompt-play" onClick={() => { setPrompt(false); start(index, request.t); }} data-testid="share-prompt-play"><PlayIcon size={18} /> Play</button>
      <span className="share-prompt-text">
        <b>{target.title}</b>{target.composer ? ` · ${target.composer}` : ""}
        {request.t ? <span className="home-dim" data-testid="share-prompt-time"> from {formatTimestamp(request.t)}</span> : null}
      </span>
      <button type="button" className="share-prompt-x" aria-label="Not now" onClick={() => setPrompt(false)}>×</button>
    </div>
  );
}
