import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { GalleryLightbox, useLightbox } from "../components/GalleryLightbox";

interface DiscographyTrack {
  id: number;
  title: string;
  fileUrl: string;
  format: string;
  durationSeconds: number | null;
  position: number;
}

interface DiscographyAlbum {
  slug: string;
  title: string;
  coverArtUrl: string | null;
  branchSlug: string;
  tracks: DiscographyTrack[];
}

interface CollaboratorDetail {
  slug: string;
  name: string;
  role: string;
  bio: string | null;
  pictureUrl: string | null;
  links: { label: string; url: string }[] | null;
  linkedUsername: string | null;
  gallery: { id: number; url: string }[];
  discography: DiscographyAlbum[];
}

export function CollaboratorPage() {
  const { slug } = useParams<{ slug: string }>();
  const [collaborator, setCollaborator] = useState<CollaboratorDetail | null>(null);
  const lightbox = useLightbox();
  const isDesktop = useIsDesktop();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);

  useEffect(() => {
    if (!slug) return;
    api<CollaboratorDetail>(`/api/collaborators/${slug}`).then(setCollaborator);
  }, [slug]);

  if (!collaborator) return <p>Loading…</p>;

  function playTrack(album: DiscographyAlbum, track: DiscographyTrack) {
    play({
      id: track.id,
      title: track.title,
      fileUrl: track.fileUrl,
      format: track.format,
      durationSeconds: track.durationSeconds,
      position: track.position,
      albumTitle: album.title,
      albumSlug: album.slug,
      coverArtUrl: album.coverArtUrl,
      composer: collaborator!.name,
      branchSlug: album.branchSlug,
      bookmarks: [],
    });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
        <div
          style={{
            width: isDesktop ? 160 : "30vw",
            height: isDesktop ? 160 : "30vw",
            maxWidth: 160,
            maxHeight: 160,
            flexShrink: 0,
            borderRadius: "50%",
            background: collaborator.pictureUrl ? `url(${collaborator.pictureUrl}) center/cover` : "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ marginBottom: "0.1rem" }}>{collaborator.name}</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>{collaborator.role}</p>
          {collaborator.bio && <p style={{ maxWidth: 560 }}>{collaborator.bio}</p>}
          {collaborator.links && collaborator.links.length > 0 && (
            <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
              {collaborator.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {collaborator.gallery.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.2rem" }}>
          {collaborator.gallery.map((g, i) => (
            <img
              key={g.id}
              src={g.url}
              alt=""
              onClick={() => lightbox.open(i)}
              style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "var(--radius)", cursor: "pointer" }}
            />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Discography</h2>
      {collaborator.discography.length === 0 && <p style={{ color: "var(--text-dim)" }}>No credited tracks yet.</p>}
      {collaborator.discography.map((album) => (
        <div key={album.slug} style={{ display: "flex", gap: "0.8rem", marginBottom: "1.2rem" }}>
          <Link to={`/album/${album.slug}`} style={{ flexShrink: 0 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "var(--radius)",
                background: album.coverArtUrl ? `url(${album.coverArtUrl}) center/cover` : "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
            />
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link to={`/album/${album.slug}`} style={{ fontWeight: 600 }}>
              {album.title}
            </Link>
            {album.tracks
              .sort((a, b) => a.position - b.position)
              .map((track) => (
                <div key={track.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", padding: "0.15rem 0" }}>
                  <button className="btn" style={{ padding: "0.1rem 0.4rem" }} onClick={() => playTrack(album, track)} title="Play">
                    ▶
                  </button>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</span>
                  <button
                    className="btn"
                    style={{ padding: "0.1rem 0.4rem", marginLeft: "auto" }}
                    onClick={() =>
                      addToQueue([
                        {
                          id: track.id,
                          title: track.title,
                          fileUrl: track.fileUrl,
                          format: track.format,
                          durationSeconds: track.durationSeconds,
                          position: track.position,
                          albumTitle: album.title,
                          albumSlug: album.slug,
                          coverArtUrl: album.coverArtUrl,
                          composer: collaborator!.name,
                          branchSlug: album.branchSlug,
                          bookmarks: [],
                        },
                      ])
                    }
                    title="Add to queue"
                  >
                    +
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}

      {lightbox.index !== null && (
        <GalleryLightbox images={collaborator.gallery} index={lightbox.index} onClose={lightbox.close} onNavigate={lightbox.open} />
      )}
    </div>
  );
}
