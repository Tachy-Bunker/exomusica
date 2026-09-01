import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import type { Branch, BranchAlbum, PlayableTrackDTO } from "../lib/types";
import { ChannelPage } from "./ChannelPage";
import { RootDivider } from "../components/RootDivider";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useCustomFont } from "../lib/useCustomFont";

export function BranchPage() {
  const { slug } = useParams<{ slug: string }>();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [albums, setAlbums] = useState<BranchAlbum[]>([]);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const fontFamily = useCustomFont(branch?.font);

  async function queueAlbum(albumSlug: string) {
    const full = await api<{ tracks: PlayableTrackDTO[] }>(`/api/albums/${albumSlug}`);
    addToQueue(full.tracks);
  }

  async function playAlbum(albumSlug: string) {
    const full = await api<{ tracks: PlayableTrackDTO[] }>(`/api/albums/${albumSlug}`);
    if (full.tracks.length === 0) return;
    const [first, ...rest] = full.tracks;
    play(first);
    addToQueue(rest);
  }

  useEffect(() => {
    if (!slug) return;
    api<Branch>(`/api/branches/${slug}`).then(setBranch);
    api<BranchAlbum[]>(`/api/branches/${slug}/albums`).then(setAlbums);
  }, [slug]);

  useDocumentTitle(branch?.name ?? "");

  if (!branch) return <p>Loading…</p>;

  return (
    <div style={{ fontFamily }}>
      <h1>{branch.name}</h1>
      {branch.description && <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{branch.description}</p>}


      <h2 style={{ fontSize: "1.1rem", color: "var(--accent-audio)" }}>Music</h2>
      {albums.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          No releases yet. Full album pages (streaming/download links, collaborator cards) are a Phase 3 build —
          this shows whatever's already in the database.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
          {albums.map((a) => (
            <div key={a.id}>
              <Link to={`/album/${a.slug}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <div
                  style={{
                    aspectRatio: "1",
                    background: a.coverArtUrl ? `url(${a.coverArtUrl}) center/cover` : "var(--bg-elevated)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    position: "relative",
                  }}
                >
                  {a.previewTrack && (
                    <button
                      className="btn"
                      style={{ position: "absolute", bottom: 8, right: 40 }}
                      title="Play album"
                      onClick={(e) => {
                        e.preventDefault();
                        void playAlbum(a.slug);
                      }}
                    >
                      ▶
                    </button>
                  )}
                  <button
                    className="btn"
                    style={{ position: "absolute", bottom: 8, right: 8 }}
                    title="Add whole album to queue"
                    onClick={(e) => {
                      e.preventDefault();
                      void queueAlbum(a.slug);
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ fontSize: "0.9rem", marginTop: "0.3rem" }}>{a.title}</div>
              </Link>
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{a.composer}</div>
            </div>
          ))}
        </div>
      )}

      <RootDivider />

      <h2 style={{ fontSize: "1.1rem", color: "var(--accent-forum)" }}>Forum</h2>
      {branch.channel ? <ChannelPage channelSlug={branch.channel.slug} /> : <p>No topic yet.</p>}
    </div>
  );
}
