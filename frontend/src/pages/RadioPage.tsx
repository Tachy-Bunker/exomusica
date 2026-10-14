import { branchHref } from "../lib/branchLinks";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useChatDockStore } from "../lib/chatDockStore";
import { loadMilestones } from "../lib/milestones";
import { asStation, nextAskMs, STATIONS, stationUrl, untilText, type RadioNow, type Station } from "../lib/radio";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useHeaderTheme } from "../lib/headerTheme";
import { PlayIcon } from "../components/Icons";

/** Radio: everyone hears the same song at the same moment, because the server only answers "what's on now". Crate radio and Long wave join the branch station when the community unlocks them. */
export function RadioPage() {
  useDocumentTitle("Radio");
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Station[]>(["branch"]);
  const want = asStation(params.get("station"));
  const station: Station = open.includes(want) ? want : "branch";
  const [now, setNow] = useState<RadioNow | null>(null);
  const [empty, setEmpty] = useState(false);
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  const onRef = useRef(false);
  const playAt = useAudioStore((s) => s.playAt);
  const setPageChannel = useChatDockStore((s) => s.setPageChannel);
  useHeaderTheme(station === "branch" ? now?.branch?.slug : null);

  useEffect(() => {
    let live = true;
    void loadMilestones().then((l) => { if (live) setOpen(STATIONS.filter((s) => s.key === null || l.find((m) => m.key === s.key)?.reached).map((s) => s.id)); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const tune = useCallback(async (start: boolean) => {
    try {
      const r = await api<RadioNow>(stationUrl(station));
      if (!r?.track) { setEmpty(true); return; }
      setNow(r); setEmpty(false);
      if (start) playAt(r.track, r.offset);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { void tune(onRef.current); }, nextAskMs(r.remaining));
    } catch { setEmpty(true); }
  }, [playAt, station]);

  useEffect(() => { setNow(null); setEmpty(false); void tune(onRef.current); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, [tune]);
  useEffect(() => { // the room of the branch on air is the room in the chat dock
    const b = station === "branch" ? now?.branch : null;
    if (!b?.channelSlug) return;
    setPageChannel({ slug: b.channelSlug, name: b.name, branchSlug: b.slug });
    return () => setPageChannel(null);
  }, [station, now?.branch, setPageChannel]);

  function tuneIn() { onRef.current = true; setOn(true); void tune(true); }
  function leave() { onRef.current = false; setOn(false); if (useAudioStore.getState().isPlaying) useAudioStore.getState().toggle(); }
  const st = STATIONS.find((s) => s.id === station)!;

  return (
    <div className="page-column" style={{ maxWidth: 640 }} data-testid="radio-page">
      <h1>Radio</h1>
      {open.length > 1 && (
        <div role="tablist" aria-label="Stations" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.6rem" }} data-testid="radio-stations">
          {STATIONS.filter((s) => open.includes(s.id)).map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === station} className={`btn${s.id === station ? " btn-primary" : ""}`} data-testid={`radio-st-${s.id}`}
              onClick={() => { const next = new URLSearchParams(params); if (s.id === "branch") next.delete("station"); else next.set("station", s.id); setParams(next, { replace: true }); }}>{s.label}</button>
          ))}
        </div>
      )}
      <p className="home-dim" style={{ fontSize: "0.85rem" }} data-testid="radio-blurb">{st.blurb}</p>
      {empty ? <p className="home-dim" data-testid="radio-empty">Nothing is on air yet.</p> : !now ? <p className="home-dim">Tuning…</p> : now.locked ? <p className="home-dim" data-testid="radio-empty">This station is not open yet.</p> : (
        <div className="radio-card" data-testid="radio-card" data-station={station}>
          {station === "branch" && now.branch && <div className="radio-branch">On air · <Link to={branchHref(now.branch.slug)}>{now.branch.name}</Link> {now.blockEndsAt != null && <span className="home-dim">· switches in {untilText(now.blockEndsAt - now.serverNow)}</span>}</div>}
          {station === "crate" && now.credit && <div className="radio-branch" data-testid="radio-credit">From the playlist <Link to={`/playlist/${now.credit.slug}`}>{now.credit.title}</Link> <span className="home-dim">by {now.credit.owner}</span></div>}
          {station === "longwave" && <div className="radio-branch" data-testid="radio-loop">Long wave <span className="home-dim">· one loop is {untilText(((now as RadioNow & { loopSeconds?: number }).loopSeconds ?? 0) * 1000)}</span></div>}
          <div className="radio-title" data-testid="radio-title">{now.track.title}</div>
          <div className="home-dim">{now.track.albumTitle} · {now.track.composer}</div>
          {on
            ? <button className="btn" onClick={leave} data-testid="radio-leave">Leave radio</button>
            : <button className="btn btn-primary" onClick={tuneIn} data-testid="radio-tune"><PlayIcon size={16} /> Tune in</button>}
          {now.upcoming.length > 0 && <p className="home-dim" style={{ fontSize: "0.85rem", marginBottom: 0 }}>Next: {now.upcoming.map((u) => u.title).join(" · ")}</p>}
          {station === "branch" && now.branch?.channelSlug && <p style={{ fontSize: "0.85rem", marginBottom: 0 }}>Chat about it in the dock, or <Link to={`/topic/${now.branch.channelSlug}`}>open the room</Link>.</p>}
        </div>
      )}
    </div>
  );
}
