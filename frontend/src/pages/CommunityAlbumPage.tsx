import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { PlayableTrackDTO } from "../lib/types";

interface CommunityTrackPlayable extends PlayableTrackDTO {
  permission: "LISTEN_ONLY" | "CREDIT_REQUIRED" | "FREE_REMIX";
  likeCount: number;
  likedByMe: boolean;
  remixOf: { title: string; albumSlug: string } | null;
}

interface CommunityAlbumDetail {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
  description: string | null;
  owner: { username: string };
  tracks: CommunityTrackPlayable[];
}

export function CommunityAlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const [album, setAlbum] = useState<CommunityAlbumDetail | null>(null);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);

  function playTrack(track: CommunityTrackPlayable) {
    if (!album) return;
    const index = album.tracks.findIndex((t) => t.id === track.id);
    if (index === -1) return;
    const [first, ...rest] = album.tracks.slice(index);
    play(first);
    clearQueue();
    addToQueue(rest);
  }

  useEffect(() => {
    if (!slug) return;
    api<CommunityAlbumDetail>(`/api/community-albums/${slug}`).then(setAlbum);
  }, [slug]);

  useDocumentTitle(album?.title ?? "");

  async function toggleLike(trackId: number) {
    await api(`/api/community-tracks/${trackId}/like`, { method: "POST" });
    if (slug) api<CommunityAlbumDetail>(`/api/community-albums/${slug}`).then(setAlbum);
  }

  const PERMISSION_LABEL: Record<string, string> = {
    LISTEN_ONLY: "Listening only",
    CREDIT_REQUIRED: "Remix OK with credit",
    FREE_REMIX: "Free to remix",
  };

  if (!album) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "0.6rem 0.8rem",
          marginBottom: "1rem",
          fontSize: "0.8rem",
          color: "var(--text-dim)",
        }}
      >
        <strong style={{ color: "var(--text)" }}>User-generated content.</strong> Exomusica is not responsible for
        user-generated content. If you'd like it taken down,{" "}
        <Link to="/wiki">contact us directly</Link>.
      </div>

      <div style={{ display: "flex", gap: "1.2rem" }}>
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ marginBottom: "0.1rem", overflowWrap: "break-word" }}>{album.title}</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>{album.composer}</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Uploaded by {album.owner.username}</p>
        </div>
      </div>

      {album.description && <p style={{ marginTop: "1.2rem" }}>{album.description}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Tracks</h2>
        {album.tracks.length > 0 && (
          <button className="btn" onClick={() => addToQueue(album.tracks)}>
            Add all to queue
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {album.tracks.length === 0 ? (
          <p style={{ color: "var(--text-dim)" }}>No tracks yet.</p>
        ) : (
          album.tracks.map((t, i) => (
            <div
              key={t.id}
              style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0.6rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
            >
              <button className="btn" onClick={() => playTrack(t)}>
                ▶
              </button>
              <button className="btn" onClick={() => addToQueue([t])} title="Add to queue">
                +
              </button>
              <span className="mono" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>
                {t.title}
                <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                  {PERMISSION_LABEL[t.permission]}
                  {t.remixOf && (
                    <>
                      {" · a remix of "}
                      <Link to={`/community-album/${t.remixOf.albumSlug}`}>{t.remixOf.title}</Link>
                    </>
                  )}
                </span>
              </span>
              <button
                className="btn"
                onClick={() => toggleLike(t.id)}
                title="Resonate"
                style={{ color: t.likedByMe ? "var(--accent-forum)" : undefined }}
              >
                ◈ {t.likeCount}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
