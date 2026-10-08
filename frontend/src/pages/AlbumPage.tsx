import { PlayGlow } from "../components/PlayGlow";
import { PauseIcon, PlayIcon } from "../components/Icons";
import { branchHref } from "../lib/branchLinks";
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { renderMarkdown } from "../lib/markdown";
import { GalleryLightbox, useLightbox } from "../components/GalleryLightbox";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import type { PlayableTrackDTO } from "../lib/types";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { ShareAutoplay } from "../components/ShareAutoplay";
import { ShareModal } from "../components/ShareModal";
import { parseAutoplay } from "../lib/shareState";

interface TrackWithComposers extends PlayableTrackDTO {
  composers: { id: number; name: string; slug: string | null }[];
}

interface AlbumDetail {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
  description: string | null;
  contentMarkdown: string | null;
  links: { id: number; label: string; url: string; iconUrl: string | null; linkIcon: { url: string } | null }[];
  gallery: { id: number; url: string }[];
  branch: { slug: string; name: string };
  collaborators: { id: number; slug: string | null; name: string; role: string; bio: string | null; pictureUrl: string | null }[];
  tracks: TrackWithComposers[];
}

export function AlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const lightbox = useLightbox();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const play = useAudioStore((s) => s.play);
  const playAt = useAudioStore((s) => s.playAt);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);
  const cur = useAudioStore((s) => s.currentTrack);
  const audioPlaying = useAudioStore((s) => s.isPlaying);
  const toggleAudio = useAudioStore((s) => s.toggle);
  const albumOn = !!album && cur?.albumSlug === album.slug && cur.source !== "community";
  const [searchParams] = useSearchParams();
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api<AlbumDetail>(`/api/albums/${slug}`).then(setAlbum);
  }, [slug]);

  useDocumentTitle(album?.title ?? "");

  useEffect(() => {
    if (!isDesktop || !album) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "KeyR") navigate(branchHref(album!.branch.slug));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, album, navigate]);

  if (!album) return <p>Loading…</p>;

  return (
    <div className="page-column" style={{ maxWidth: 720 }}>
      <Link to={branchHref(album.branch.slug)} style={{ fontSize: "0.85rem" }}>
        ← Back to {album.branch.name}
        {isDesktop && " (R)"}
      </Link>
      <div style={{ display: "flex", gap: "1.2rem", marginTop: "0.6rem" }}>
        <div
          style={{
            width: 160,
            height: 160,
            flexShrink: 0,
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: album.coverArtUrl ? `url(${album.coverArtUrl}) center/cover` : "var(--bg-elevated)",
          }}
        />
        <div style={{ minWidth: 0, flex: 1, paddingRight: isDesktop ? 0 : "1.2rem" }}>
          <h1
            style={{
              marginBottom: "0.1rem",
              overflowWrap: "break-word",
              hyphens: "auto",
              ...(isDesktop
                ? {}
                : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
            }}
          >
            {album.title}
          </h1>
          <p
            style={{
              color: "var(--text-dim)",
              marginTop: 0,
              overflowWrap: "break-word",
              hyphens: "auto",
              ...(isDesktop
                ? {}
                : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
            }}
          >
            {album.composer}
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
            {album.links.map((l) => {
              const iconUrl = l.linkIcon?.url ?? l.iconUrl;
              return iconUrl ? (
                <a key={l.id} className="album-link-icon" href={l.url} target="_blank" rel="noreferrer" title={l.label}>
                  <img src={iconUrl} alt={l.label} />
                </a>
              ) : (
                <a key={l.id} className="btn" href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {album.description && <p style={{ marginTop: "1.2rem" }}>{album.description}</p>}
      {album.contentMarkdown && <div style={{ marginTop: "1rem" }}>{renderMarkdown(album.contentMarkdown, navigate)}</div>}

      {album.gallery.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", overflowX: "auto" }}>
          {(() => {
            const imageItems = album.gallery.filter((g) => !/\.(mp4|mov)$/i.test(g.url));
            return album.gallery.map((g) =>
              /\.(mp4|mov)$/i.test(g.url) ? (
                <video
                  key={g.id}
                  src={g.url}
                  controls
                  style={{ height: 120, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
                />
              ) : (
                <img
                  key={g.id}
                  src={g.url}
                  alt=""
                  onClick={() => lightbox.open(imageItems.findIndex((i) => i.id === g.id))}
                  style={{ height: 120, borderRadius: "var(--radius)", border: "1px solid var(--border)", cursor: "pointer" }}
                />
              ),
            );
          })()}
        </div>
      )}

      {lightbox.index !== null && (
        <GalleryLightbox
          images={album.gallery.filter((g) => !/\.(mp4|mov)$/i.test(g.url))}
          index={lightbox.index}
          onClose={lightbox.close}
          onNavigate={lightbox.open}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Tracks</h2>
        <PlayGlow>
          <button className="btn btn-primary icon-btn" onClick={() => { if (albumOn) { toggleAudio(); return; } const [first, ...rest] = album.tracks; if (!first) return; play(first); clearQueue(); addToQueue(rest); setCurrentPlaylist(null); }} disabled={album.tracks.length === 0} aria-label={albumOn && audioPlaying ? "Pause" : "Play the album"} title={albumOn && audioPlaying ? "Pause" : "Play the album"} data-testid="album-play-all">{albumOn && audioPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}</button>
        </PlayGlow>
        <button className="btn" onClick={() => addToQueue(album.tracks)}>
          Add all to queue
        </button>
        <button className="btn" onClick={() => setShareOpen(true)} data-testid="share-open-btn" title="Share a link to this album, or to a song in it and a moment of that song">Share</button>
      </div>
      <ShareAutoplay
        ready
        tracks={album.tracks.map((t) => ({ id: t.id, source: t.source, title: t.title, composer: t.composer }))}
        request={parseAutoplay(searchParams)}
        start={(index, t) => {
          const [first, ...rest] = album.tracks.slice(index);
          if (!first) return;
          playAt(first, t);
          clearQueue();
          addToQueue(rest);
          setCurrentPlaylist(null);
        }}
      />
      {shareOpen && (
        <ShareModal
          title="Share this album"
          pathname={`/album/${slug}`}
          tracks={album.tracks.map((t) => ({ id: t.id, source: t.source, title: t.title, composer: t.composer }))}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {album.tracks.map((t, i) => (
          <div
            key={t.id}
            className="track-hl-host"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.4rem 0.6rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <PlayGlow when="hover" hostSelector=".track-hl-host">
              <button className="btn" onClick={() => { if (cur?.id === t.id && cur.albumSlug === t.albumSlug && cur.source !== "community") { toggleAudio(); return; } play(t); setCurrentPlaylist(null); }} aria-label={cur?.id === t.id && audioPlaying ? `Pause ${t.title}` : `Play ${t.title}`}>
                {cur?.id === t.id && cur.albumSlug === t.albumSlug && cur.source !== "community" && audioPlaying ? <PauseIcon size={13} /> : "▶"}
              </button>
            </PlayGlow>
            <button className="btn" onClick={() => addToQueue([t])} title="Add to queue">
              +
            </button>
            <span className="mono" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>
              {t.title}
              {t.composers.length > 0 && (
                <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
                  {" "}
                  -{" "}
                  {t.composers.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      {c.slug ? <Link to={`/collaborator/${c.slug}`}>{c.name}</Link> : c.name}
                    </span>
                  ))}
                </span>
              )}
            </span>
            {t.bookmarks.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{t.bookmarks.length} bookmarks</span>
            )}
            <AddToPlaylistControl trackId={t.id} />
          </div>
        ))}
      </div>

      {album.collaborators.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Collaborators</h2>
          <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
            {album.collaborators.map((c) => {
              const card = (
                <>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: c.pictureUrl ? `url(${c.pictureUrl}) center/cover` : "var(--bg-elevated)",
                    }}
                  />
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem", overflowWrap: "break-word" }}>{c.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--accent-forum)", overflowWrap: "break-word" }}>{c.role}</div>
                </>
              );
              return c.slug ? (
                <Link key={c.id} to={`/collaborator/${c.slug}`} style={{ maxWidth: 200, textDecoration: "none", color: "inherit" }}>
                  {card}
                </Link>
              ) : (
                <div key={c.id} style={{ maxWidth: 200 }}>
                  {card}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
