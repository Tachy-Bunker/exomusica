import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import type { PlayableTrackDTO } from "../lib/types";

interface AlbumDetail {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
  description: string | null;
  streamUrl: string | null;
  downloadUrl: string | null;
  branch: { slug: string; name: string };
  collaborators: { id: number; name: string; role: string; bio: string | null; pictureUrl: string | null }[];
  tracks: PlayableTrackDTO[];
}

export function AlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const play = useAudioStore((s) => s.play);

  useEffect(() => {
    if (!slug) return;
    api<AlbumDetail>(`/api/albums/${slug}`).then(setAlbum);
  }, [slug]);

  if (!album) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to={`/branch/${album.branch.slug}`} style={{ fontSize: "0.85rem" }}>
        ← {album.branch.name}
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
        <div>
          <h1 style={{ marginBottom: "0.1rem" }}>{album.title}</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>{album.composer}</p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            {album.streamUrl && (
              <a className="btn" href={album.streamUrl} target="_blank" rel="noreferrer">
                Stream elsewhere
              </a>
            )}
            {album.downloadUrl && (
              <a className="btn" href={album.downloadUrl} target="_blank" rel="noreferrer">
                Download
              </a>
            )}
          </div>
        </div>
      </div>

      {album.description && <p style={{ marginTop: "1.2rem" }}>{album.description}</p>}

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Tracks</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {album.tracks.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.4rem 0.6rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <button className="btn" onClick={() => play(t)}>
              ▶
            </button>
            <span className="mono" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>{t.title}</span>
            {t.bookmarks.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{t.bookmarks.length} bookmarks</span>
            )}
          </div>
        ))}
      </div>

      {album.collaborators.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Collaborators</h2>
          <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
            {album.collaborators.map((c) => (
              <div key={c.id} style={{ maxWidth: 200 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: c.pictureUrl ? `url(${c.pictureUrl}) center/cover` : "var(--bg-elevated)",
                  }}
                />
                <div style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>{c.name}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--accent-forum)" }}>{c.role}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
