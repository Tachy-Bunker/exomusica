import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { PlayableTrackDTO } from "../lib/types";

interface PlaylistItem {
  id: number;
  source: "official" | "community";
  trackId: number;
  title: string;
  fileUrl: string;
  durationSeconds: number | null;
  albumTitle: string;
  albumSlug: string;
  coverArtUrl: string | null;
  composer: string | null;
  branchSlug: string | null;
  replayGainDb: number | null;
  genres: string[];
  trackPosition: number;
}
interface PlaylistDetail {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  owner: string;
  ownerId: number;
  collaborators: { id: number; username: string }[];
  items: PlaylistItem[];
}

export function PlaylistPage() {
  const { slug } = useParams<{ slug: string }>();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [collabUsername, setCollabUsername] = useState("");
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);

  function reload() {
    if (!slug) return;
    api<PlaylistDetail>(`/api/playlists/${slug}`).then(setPlaylist);
  }

  async function saveTitle() {
    if (!playlist || !titleDraft.trim()) return;
    await api(`/api/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ title: titleDraft.trim() }) });
    setEditingTitle(false);
    reload();
  }

  useEffect(reload, [slug]);

  async function addCollaborator() {
    if (!playlist || !collabUsername.trim()) return;
    try {
      await api(`/api/playlists/${playlist.id}/collaborators`, { method: "POST", body: JSON.stringify({ username: collabUsername.trim() }) });
      setCollabUsername("");
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add collaborator");
    }
  }

  async function removeCollaborator(userId: number) {
    if (!playlist) return;
    await api(`/api/playlists/${playlist.id}/collaborators/${userId}`, { method: "DELETE" });
    reload();
  }

  useDocumentTitle(playlist?.title ?? "");

  if (!playlist) return <p>Loading…</p>;

  const toPlayable = (item: PlaylistItem): PlayableTrackDTO => ({
    id: item.trackId,
    title: item.title,
    fileUrl: item.fileUrl,
    format: "MP3",
    durationSeconds: item.durationSeconds,
    position: 0,
    albumTitle: item.albumTitle,
    albumSlug: item.albumSlug,
    coverArtUrl: item.coverArtUrl,
    composer: item.composer ?? playlist.owner,
    branchSlug: item.branchSlug,
    bookmarks: [],
    replayGainDb: item.replayGainDb,
    source: item.source,
    genres: item.genres,
  });

  const allPlayable = playlist.items.map(toPlayable);

  function playTrack(item: PlaylistItem) {
    if (!playlist) return;
    const index = playlist.items.findIndex((i) => i.id === item.id);
    if (index === -1) return;
    const [first, ...rest] = allPlayable.slice(index);
    play(first);
    clearQueue();
    addToQueue(rest);
    setCurrentPlaylist({ slug: playlist.slug, title: playlist.title });
  }

  const albumGroups = new Map<string, { title: string; coverArtUrl: string | null; source: "official" | "community"; slug: string; items: PlaylistItem[] }>();
  for (const item of playlist.items) {
    const key = `${item.source}:${item.albumSlug}`;
    if (!albumGroups.has(key)) {
      albumGroups.set(key, { title: item.albumTitle, coverArtUrl: item.coverArtUrl, source: item.source, slug: item.albumSlug, items: [] });
    }
    albumGroups.get(key)!.items.push(item);
  }
  for (const group of albumGroups.values()) {
    group.items.sort((a, b) => a.trackPosition - b.trackPosition);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {editingTitle ? (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} style={{ fontSize: "1.3rem" }} autoFocus />
              <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={saveTitle}>
                save
              </button>
              <button className="btn" style={{ fontSize: "0.8rem" }} onClick={() => setEditingTitle(false)}>
                cancel
              </button>
            </div>
          ) : (
            <h1 style={{ marginBottom: "0.1rem" }}>
              {playlist.title}
              {user?.id === playlist.ownerId && (
                <button
                  className="btn"
                  style={{ fontSize: "0.7rem", marginLeft: "0.5rem", verticalAlign: "middle" }}
                  onClick={() => {
                    setTitleDraft(playlist.title);
                    setEditingTitle(true);
                  }}
                >
                  rename
                </button>
              )}
            </h1>
          )}
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>by {playlist.owner}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn" to={`/playlist/${playlist.slug}`} title="View as spacemap">
            <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M128,116a48,48,0,1,1,48-48A48.05436,48.05436,0,0,1,128,116Zm60,8a48,48,0,1,0,48,48A48.05436,48.05436,0,0,0,188,124ZM68,124a48,48,0,1,0,48,48A48.05436,48.05436,0,0,0,68,124Z" />
            </svg>
          </Link>
          <Link className="btn" to={`/playlist/${playlist.slug}#venn`} title="View as constellation">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M27,5c-1.7,0-3,1.3-3,3c0,0.3,0,0.5,0.1,0.8l-5.4,3.8C18.2,12.2,17.6,12,17,12c-0.8,0-1.5,0.3-2.1,0.8L8,9.4 C8,9.2,8,9.1,8,9c0-1.7-1.3-3-3-3S2,7.3,2,9s1.3,3,3,3c0.8,0,1.5-0.3,2.1-0.8l7,3.5c0,0.1,0,0.2,0,0.4c0,0.9,0.4,1.7,1,2.2L12.2,24 c-0.1,0-0.1,0-0.2,0c-1.7,0-3,1.3-3,3s1.3,3,3,3s3-1.3,3-3c0-0.9-0.4-1.7-1-2.2l2.8-6.8c0.1,0,0.1,0,0.2,0c1.7,0,3-1.3,3-3 c0-0.3,0-0.5-0.1-0.8l5.4-3.8c0.5,0.4,1.1,0.6,1.7,0.6c1.7,0,3-1.3,3-3S28.7,5,27,5z" />
            </svg>
          </Link>
        </div>
      </div>

      {playlist.description && <p style={{ marginTop: "0.8rem" }}>{playlist.description}</p>}

      {playlist.collaborators.length > 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Also built by: {playlist.collaborators.map((c) => c.username).join(", ")}
        </p>
      )}
      {user?.id === playlist.ownerId && (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.4rem" }}>
          <input placeholder="Add a collaborator by username" value={collabUsername} onChange={(e) => setCollabUsername(e.target.value)} style={{ fontSize: "0.85rem" }} />
          <button className="btn" style={{ fontSize: "0.8rem" }} onClick={addCollaborator}>
            Add
          </button>
          {playlist.collaborators.map((c) => (
            <button key={c.id} className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => removeCollaborator(c.id)}>
              remove {c.username}
            </button>
          ))}
        </div>
      )}

      {playlist.items.length > 0 && (
        <button
          className="btn btn-primary"
          style={{ marginTop: "1rem" }}
          onClick={() => {
            const [first, ...rest] = allPlayable;
            play(first);
            clearQueue();
            addToQueue(rest);
            setCurrentPlaylist({ slug: playlist.slug, title: playlist.title });
          }}
        >
          Play all
        </button>
      )}

      {[...albumGroups.values()].map((album) => (
        <div key={`${album.source}:${album.slug}`} style={{ display: "flex", gap: "0.8rem", marginTop: "1.2rem" }}>
          <Link to={album.source === "official" ? `/album/${album.slug}` : `/community-album/${album.slug}`} style={{ flexShrink: 0 }}>
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
            <Link to={album.source === "official" ? `/album/${album.slug}` : `/community-album/${album.slug}`} style={{ fontWeight: 600 }}>
              {album.title}
            </Link>
            {album.source === "community" && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "0.4rem" }}>(community)</span>}
            {album.items.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", padding: "0.15rem 0" }}>
                <button className="btn" style={{ padding: "0.1rem 0.4rem" }} onClick={() => playTrack(item)} title="Play">
                  ▶
                </button>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
