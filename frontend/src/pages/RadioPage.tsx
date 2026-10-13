import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useChatDockStore } from "../lib/chatDockStore";
import { nextAskMs, untilText, type RadioNow } from "../lib/radio";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useHeaderTheme } from "../lib/headerTheme";
import { PlayIcon } from "../components/Icons";

/** Radio: everyone hears the same song at the same moment, because the server only answers "what's on now". */
export function RadioPage() {
  useDocumentTitle("Radio");
  const [now, setNow] = useState<RadioNow | null>(null);
  const [empty, setEmpty] = useState(false);
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  const onRef = useRef(false);
  const playAt = useAudioStore((s) => s.playAt);
  const setPageChannel = useChatDockStore((s) => s.setPageChannel);
  useHeaderTheme(now?.branch.slug);

  const tune = useCallback(async (start: boolean) => {
    try {
      const r = await api<RadioNow>("/api/radio/now");
      if (!r?.track) { setEmpty(true); return; }
      setNow(r); setEmpty(false);
      if (start) playAt(r.track, r.offset);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { void tune(onRef.current); }, nextAskMs(r.remaining));
    } catch { setEmpty(true); }
  }, [playAt]);

  useEffect(() => { void tune(false); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, [tune]);
  useEffect(() => { // the room of the branch on air is the room in the chat dock
    if (!now?.branch.channelSlug) return;
    setPageChannel({ slug: now.branch.channelSlug, name: now.branch.name, branchSlug: now.branch.slug });
    return () => setPageChannel(null);
  }, [now?.branch.channelSlug, now?.branch.name, now?.branch.slug, setPageChannel]);

  function tuneIn() { onRef.current = true; setOn(true); void tune(true); }
  function leave() { onRef.current = false; setOn(false); if (useAudioStore.getState().isPlaying) useAudioStore.getState().toggle(); }

  return (
    <div className="page-column" style={{ maxWidth: 640 }} data-testid="radio-page">
      <h1>Radio</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>One branch on air at a time, the same moment for everyone. The branch changes with the time of day (UTC).</p>
      {empty ? <p className="home-dim" data-testid="radio-empty">Nothing is on air yet.</p> : !now ? <p className="home-dim">Tuning…</p> : (
        <div className="radio-card" data-testid="radio-card">
          <div className="radio-branch">On air · <Link to={`/branch/${now.branch.slug}`}>{now.branch.name}</Link> <span className="home-dim">· switches in {untilText(now.blockEndsAt - now.serverNow)}</span></div>
          <div className="radio-title" data-testid="radio-title">{now.track.title}</div>
          <div className="home-dim">{now.track.albumTitle} · {now.track.composer}</div>
          {on
            ? <button className="btn" onClick={leave} data-testid="radio-leave">Leave radio</button>
            : <button className="btn btn-primary" onClick={tuneIn} data-testid="radio-tune"><PlayIcon size={16} /> Tune in</button>}
          {now.upcoming.length > 0 && <p className="home-dim" style={{ fontSize: "0.85rem", marginBottom: 0 }}>Next: {now.upcoming.map((u) => u.title).join(" · ")}</p>}
          {now.branch.channelSlug && <p style={{ fontSize: "0.85rem", marginBottom: 0 }}>Chat about it in the dock, or <Link to={`/topic/${now.branch.channelSlug}`}>open the room</Link>.</p>}
        </div>
      )}
    </div>
  );
}
