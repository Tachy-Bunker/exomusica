import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { renderMarkdown } from "../lib/markdown";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import type { PlayableTrackDTO } from "../lib/types";

interface TrackWithComposers extends PlayableTrackDTO {
  composers: { id: number; name: string }[];
}

interface AlbumDetail {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
  description: string | null;
  contentMarkdown: string | null;
  links: { id: number; label: string; url: string }[];
  gallery: { id: number; url: string }[];
  branch: { slug: string; name: string };
  collaborators: { id: number; name: string; role: string; bio: string | null; pictureUrl: string | null }[];
  tracks: TrackWithComposers[];
}

export function AlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);

  useEffect(() => {
    if (!slug) return;
    api<AlbumDetail>(`/api/albums/${slug}`).then(setAlbum);
  }, [slug]);

  useDocumentTitle(album?.title ?? "");

  useEffect(() => {
    if (!isDesktop || !album) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "KeyR") navigate(`/branch/${album!.branch.slug}`);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, album, navigate]);

  if (!album) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to={`/branch/${album.branch.slug}`} style={{ fontSize: "0.85rem" }}>
        ← {album.branch.name}
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
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {album.links.map((l) => (
              <a key={l.id} className="btn" href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {album.description && <p style={{ marginTop: "1.2rem" }}>{album.description}</p>}
      {album.contentMarkdown && <div style={{ marginTop: "1rem" }}>{renderMarkdown(album.contentMarkdown)}</div>}

      {album.gallery.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", overflowX: "auto" }}>
          {album.gallery.map((g) =>
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
                style={{ height: 120, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
              />
            ),
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Tracks</h2>
        <button className="btn" onClick={() => addToQueue(album.tracks)}>
          Add all to queue
        </button>
      </div>
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
                  — {t.composers.map((c) => c.name).join(", ")}
                </span>
              )}
            </span>
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
