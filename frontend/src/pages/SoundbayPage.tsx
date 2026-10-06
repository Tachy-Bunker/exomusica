import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useHome, type HomeBranch } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import type { PlayableTrackDTO } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface PlaylistRow { slug: string; title: string; owner: string; description: string | null }
interface CommunityAlbumRow { slug: string; title: string; composer: string; coverArtUrl: string | null; owner: { username: string } }

const byActivity = (a: HomeBranch, b: HomeBranch) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) || a.name.localeCompare(b.name);

export function SoundbayPage() {
  useDocumentTitle("Soundbay");
  const { home, failed } = useHome();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null);
  const [albums, setAlbums] = useState<CommunityAlbumRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<PlaylistRow[]>("/api/playlists").then((p) => alive && setPlaylists(p)).catch(() => alive && setPlaylists([]));
    api<CommunityAlbumRow[]>("/api/community-albums").then((a) => alive && setAlbums(a)).catch(() => alive && setAlbums([]));
    return () => { alive = false; };
  }, []);

  async function shuffleAll() {
    if (busy) return;
    setBusy(true);
    try {
      const tracks = await api<PlayableTrackDTO[]>("/api/tracks/shuffle");
      if (tracks.length === 0) return;
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally {
      setBusy(false);
    }
  }

  const grown = home ? home.branches.filter((b) => !b.seed).sort(byActivity) : [];
  const seeds = home ? home.branches.filter((b) => b.seed).sort(byActivity) : [];
  const card = (b: HomeBranch) => (
    <Link key={b.slug} className="home-card sb-branch" to={`/branch/${b.slug}`} data-testid="branch-card">
      {b.coverArtUrl && <img className="sb-cover" src={b.coverArtUrl} alt="" loading="lazy" width={48} height={48} />}
      <span className="home-card-title">{b.name}</span>
      <span className="sb-blurb">{b.blurb || "No description yet."}</span>
      <span className="home-dim home-card-meta">{b.albums} album{b.albums === 1 ? "" : "s"}{b.lastActiveAt ? ` · active ${timeAgo(b.lastActiveAt)}` : ""}</span>
    </Link>
  );

  return (
    <div className="home-page" data-testid="soundbay-page">
      <header className="home-hero">
        <h1>Soundbay</h1>
        <p className="home-lede">Branches of sound, with their albums and playlists. Start anywhere.</p>
        <div className="home-cta">
          <button type="button" className="btn btn-primary" onClick={shuffleAll} disabled={busy} data-testid="shuffle-all">{busy ? "Loading…" : "Shuffle everything"}</button>
          <Link className="btn" to="/?map=full" data-testid="open-map">Explore the map</Link>
          <Link className="btn" to="/listen">Player and playlists</Link>
        </div>
      </header>

      <section className="home-section" aria-labelledby="sb-branches">
        <h2 id="sb-branches" className="home-h2">Branches</h2>
        {home ? (grown.length ? <div className="home-grid">{grown.map(card)}</div> : <p className="home-dim">No branches yet.</p>) : <div className="home-placeholder">{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</div>}
      </section>
      {seeds.length > 0 && (
        <section className="home-section" aria-labelledby="sb-seeds">
          <h2 id="sb-seeds" className="home-h2">Growing seeds</h2>
          <div className="home-grid">{seeds.map(card)}</div>
        </section>
      )}
      {playlists && playlists.length > 0 && (
        <section className="home-section" aria-labelledby="sb-playlists">
          <h2 id="sb-playlists" className="home-h2">Playlists</h2>
          <div className="home-grid">
            {playlists.map((p) => (
              <Link key={p.slug} className="home-card" to={`/playlist/${p.slug}`}>
                <span className="home-card-title">{p.title}</span>
                <span className="home-dim home-card-meta">by {p.owner}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {albums && albums.length > 0 && (
        <section className="home-section" aria-labelledby="sb-albums">
          <h2 id="sb-albums" className="home-h2">Community albums</h2>
          <div className="home-grid">
            {albums.map((a) => (
              <Link key={a.slug} className="home-card" to={`/community-album/${a.slug}`}>
                <span className="home-card-title">{a.title}</span>
                <span className="home-dim home-card-meta">{a.composer || a.owner.username}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
