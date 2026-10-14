import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { setDroneWanted } from "../lib/roomDrone";
import { useAuth } from "../lib/auth";
import type { PlayableTrackDTO } from "../lib/types";
import { MiniChat } from "./MiniChat";

const mmss = (s: number | null): string => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/** The glass of a terminal: the room stays behind it. Irregular rounded corners and a soft glow in the branch colour, scanlines and a quick switch-on, all CSS. */
export function RoomTerminal({ title, color, onClose, children }: { title: string; color: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="rt" data-testid="room-terminal" role="dialog" aria-modal="true" aria-label={title} style={{ ["--rm" as string]: color }}>
      <div className="rt-bezel">
        <div className="rt-glass" ref={box} tabIndex={-1}>
          <header className="rt-head"><span className="rt-prompt">&gt; {title}</span><button type="button" className="rt-x" onClick={onClose} data-testid="terminal-close" aria-label="Close terminal">esc ✕</button></header>
          <div className="rt-body">{children}</div>
          <div className="rt-scan" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

interface Album { slug: string; title: string; composer: string; coverArtUrl: string | null; branch?: { slug: string; name: string }; tracks: PlayableTrackDTO[] }

export function AlbumTerminal({ slug }: { slug: string }) {
  const [album, setAlbum] = useState<Album | null | false>(null);
  const play = useAudioStore((s) => s.play), addToQueue = useAudioStore((s) => s.addToQueue);
  const cur = useAudioStore((s) => s.currentTrack?.id ?? null);
  useEffect(() => { let alive = true; setAlbum(null); api<Album>(`/api/albums/${slug}`).then((a) => alive && setAlbum(a && a.slug ? a : false)).catch(() => alive && setAlbum(false)); return () => { alive = false; }; }, [slug]);
  if (album === null) return <p className="rt-dim">reading…</p>;
  if (album === false) return <p className="rt-dim">This disc cannot be read.</p>;
  const from = (i: number) => { const [t, ...rest] = album.tracks.slice(i); if (!t) return; play(t); if (rest.length) addToQueue(rest); };
  return (
    <div className="rt-album">
      {album.coverArtUrl && <img src={album.coverArtUrl} alt="" className="rt-cover" loading="lazy" decoding="async" />}
      <div className="rt-info">
        <h2 className="rt-title">{album.title}</h2>
        <p className="rt-dim">{album.composer} · {album.tracks.length} track{album.tracks.length === 1 ? "" : "s"}</p>
        <div className="rt-actions">
          <button type="button" className="rt-btn" onClick={() => from(0)} disabled={!album.tracks.length} data-testid="terminal-play">▶ Play all</button>
          <button type="button" className="rt-btn" onClick={() => album.tracks.length && addToQueue(album.tracks)} disabled={!album.tracks.length}>+ Queue</button>
          <Link className="rt-btn" to={`/album/${album.slug}`} data-testid="terminal-open">Open the page</Link>
        </div>
        <ol className="rt-tracks">
          {album.tracks.map((t, i) => (
            <li key={t.id}><button type="button" className={`rt-track${cur === t.id ? " on" : ""}`} onClick={() => from(i)}><span>{String(i + 1).padStart(2, "0")}</span><span className="rt-t">{t.title}</span><span>{mmss(t.durationSeconds)}</span></button></li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Every album of the branch, when there are too many for pedestals. */
export function ListTerminal({ albums, onPick }: { albums: { slug: string; title: string }[]; onPick: (slug: string) => void }) {
  return <ul className="rt-list">{albums.map((a) => <li key={a.slug}><button type="button" className="rt-track" onClick={() => onPick(a.slug)}><span className="rt-t">&gt; {a.title}</span></button></li>)}</ul>;
}

export function ChatTerminal({ slug, name }: { slug: string; name: string }) {
  const { user } = useAuth();
  if (!user) return <p className="rt-dim">The terminal wants a name. <Link to="/login">Log in</Link> to talk in {name}.</p>;
  return <div className="rt-chat" data-testid="terminal-chat"><MiniChat slug={slug} channelName={name} /></div>;
}

/** The drone's screen: what is playing, the controls, and the queue. */
export function DroneTerminal({ onClose }: { onClose: () => void }) {
  const st = useAudioStore();
  const t = st.currentTrack;
  const away = () => { setDroneWanted(false); window.dispatchEvent(new Event("exomusica-drone-pref")); onClose(); };
  return (
    <div className="rt-drone" data-testid="drone-screen">
      {t ? (
        <>
          <h2 className="rt-title" data-testid="drone-title">{t.title}</h2>
          <p className="rt-dim">{t.composer} · <Link to={`/album/${t.albumSlug}`}>{t.albumTitle}</Link>{st.currentPlaylist ? ` · from ${st.currentPlaylist.title}` : ""}</p>
          <div className="rt-seek"><span>{mmss(st.currentTime)}</span><input type="range" aria-label="Seek" min={0} max={Math.max(1, Math.floor(st.duration || 0))} value={Math.floor(st.currentTime)} onChange={(e) => st.seek(Number(e.target.value))} data-testid="drone-seek" /><span>{mmss(st.duration || null)}</span></div>
        </>
      ) : <p className="rt-dim" data-testid="drone-idle">Nothing is playing. Pick a disc at a pedestal and the drone will carry it.</p>}
      <div className="rt-actions">
        <button type="button" className="rt-btn" onClick={st.playPrevious} data-testid="drone-prev" disabled={!t}>⏮ Prev</button>
        <button type="button" className="rt-btn" onClick={st.toggle} data-testid="drone-toggle" disabled={!t}>{st.isPlaying ? "⏸ Pause" : "▶ Play"}</button>
        <button type="button" className="rt-btn" onClick={st.playNext} data-testid="drone-next" disabled={!t && !st.queue.length}>⏭ Next</button>
        <button type="button" className="rt-btn" aria-pressed={st.shuffle} onClick={st.toggleShuffle} data-testid="drone-shuffle">Shuffle {st.shuffle ? "on" : "off"}</button>
        <button type="button" className="rt-btn" onClick={st.cycleRepeat} data-testid="drone-repeat">Repeat: {st.repeatMode}</button>
      </div>
      <h3 className="rt-sub">Queue ({st.queue.length})</h3>
      {st.queue.length === 0 ? <p className="rt-dim">The queue is empty.</p> : (
        <ol className="rt-tracks" data-testid="drone-queue">
          {st.queue.slice(0, 60).map((q, i) => <li key={`${q.id}-${i}`}><button type="button" className="rt-track" onClick={() => st.playQueueIndex(i)}><span>{String(i + 1).padStart(2, "0")}</span><span className="rt-t">{q.title}</span><span>{mmss(q.durationSeconds)}</span></button></li>)}
        </ol>
      )}
      <div className="rt-actions">
        <button type="button" className="rt-btn" onClick={st.clearQueue} disabled={!st.queue.length} data-testid="drone-clear">Clear queue</button>
        <button type="button" className="rt-btn" onClick={away} data-testid="drone-away">Send the drone away</button>
      </div>
    </div>
  );
}
