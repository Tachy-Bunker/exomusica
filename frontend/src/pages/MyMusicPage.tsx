import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface MyAlbum {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
}
interface AlbumDetailTrack {
  id: number;
  title: string;
  fileUrl: string;
  durationSeconds: number | null;
  composer: string | null;
}
interface MyPlaylist {
  id: number;
  slug: string;
  title: string;
  description: string | null;
}
interface PlaylistDetailItem {
  id: number;
  source: "official" | "community";
  title: string;
  albumTitle: string;
}
interface TrackSearchResult {
  id: number;
  title: string;
  albumTitle: string;
}

export function MyMusicPage() {
  useDocumentTitle("My Music");
  const { user } = useAuth();

  const [albums, setAlbums] = useState<MyAlbum[]>([]);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumComposer, setAlbumComposer] = useState(user?.username ?? "");
  const [managingAlbumId, setManagingAlbumId] = useState<number | null>(null);
  const [albumTracks, setAlbumTracks] = useState<AlbumDetailTrack[]>([]);
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [newTrackUrl, setNewTrackUrl] = useState("");
  const [newTrackPermission, setNewTrackPermission] = useState<"LISTEN_ONLY" | "CREDIT_REQUIRED" | "FREE_REMIX">("LISTEN_ONLY");
  const [remixQuery, setRemixQuery] = useState("");
  const [remixResults, setRemixResults] = useState<{ id: number; title: string; albumTitle: string }[]>([]);
  const [remixOfId, setRemixOfId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<MyPlaylist[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [managingPlaylistId, setManagingPlaylistId] = useState<number | null>(null);
  const [managingPlaylistSlug, setManagingPlaylistSlug] = useState<string | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistDetailItem[]>([]);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResults, setTrackResults] = useState<TrackSearchResult[]>([]);
  const [communityTrackChoice, setCommunityTrackChoice] = useState<number | "">("");

  function loadAlbums() {
    api<MyAlbum[]>("/api/community-albums?mine=true").then(setAlbums);
  }
  function loadPlaylists() {
    api<MyPlaylist[]>("/api/playlists?mine=true").then(setPlaylists);
  }
  useEffect(() => {
    loadAlbums();
    loadPlaylists();
  }, []);

  async function createAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!albumTitle.trim() || !albumComposer.trim()) return;
    await api("/api/community-albums", { method: "POST", body: JSON.stringify({ title: albumTitle.trim(), composer: albumComposer.trim() }) });
    setAlbumTitle("");
    loadAlbums();
  }

  async function deleteAlbum(id: number) {
    if (!confirm("Delete this album and all its tracks?")) return;
    await api(`/api/community-albums/${id}`, { method: "DELETE" });
    if (managingAlbumId === id) setManagingAlbumId(null);
    loadAlbums();
  }

  async function openAlbumManage(album: MyAlbum) {
    setManagingAlbumId(album.id);
    const detail = await api<{ tracks: AlbumDetailTrack[] }>(`/api/community-albums/${album.slug}`);
    setAlbumTracks(detail.tracks);
  }

  async function searchRemixSource() {
    if (!remixQuery.trim()) return;
    const results = await api<{ id: number; title: string; albumTitle: string }[]>(`/api/community-tracks/search?q=${encodeURIComponent(remixQuery.trim())}`);
    setRemixResults(results);
  }

  async function addTrackByUrl(albumId: number) {
    if (!newTrackTitle.trim() || !newTrackUrl.trim()) return;
    await api(`/api/community-albums/${albumId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ title: newTrackTitle.trim(), url: newTrackUrl.trim(), permission: newTrackPermission, remixOfId }),
    });
    setNewTrackTitle("");
    setNewTrackUrl("");
    setRemixOfId(null);
    const album = albums.find((a) => a.id === albumId);
    if (album) openAlbumManage(album);
  }

  async function uploadTrack(albumId: number) {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !newTrackTitle.trim()) return;
    setUploadError(null);
    const formData = new FormData();
    formData.append("title", newTrackTitle.trim());
    formData.append("permission", newTrackPermission);
    if (remixOfId) formData.append("remixOfId", String(remixOfId));
    formData.append("file", file);
    try {
      await api(`/api/community-albums/${albumId}/tracks`, { method: "POST", body: formData });
      setNewTrackTitle("");
      setRemixOfId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const album = albums.find((a) => a.id === albumId);
      if (album) openAlbumManage(album);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function deleteTrack(id: number, albumId: number) {
    await api(`/api/community-tracks/${id}`, { method: "DELETE" });
    const album = albums.find((a) => a.id === albumId);
    if (album) openAlbumManage(album);
  }

  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editComposer, setEditComposer] = useState("");

  function startEditTrack(t: AlbumDetailTrack) {
    setEditingTrackId(t.id);
    setEditTitle(t.title);
    setEditComposer(t.composer ?? "");
  }

  async function saveTrackEdit(albumId: number) {
    if (!editingTrackId) return;
    await api(`/api/community-tracks/${editingTrackId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editTitle.trim(), composer: editComposer.trim() || null }),
    });
    setEditingTrackId(null);
    const album = albums.find((a) => a.id === albumId);
    if (album) openAlbumManage(album);
  }

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploadingAlbumId, setCoverUploadingAlbumId] = useState<number | null>(null);

  async function uploadCover(albumId: number, fileOverride?: File) {
    const file = fileOverride ?? coverInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setCoverUploadingAlbumId(albumId);
    try {
      await api(`/api/community-albums/${albumId}/cover`, { method: "POST", body: formData });
      if (coverInputRef.current) coverInputRef.current.value = "";
      loadAlbums();
    } finally {
      setCoverUploadingAlbumId(null);
    }
  }

  function handleCoverPaste(e: React.ClipboardEvent, albumId: number) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    uploadCover(albumId, file);
  }

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!playlistTitle.trim()) return;
    await api("/api/playlists", { method: "POST", body: JSON.stringify({ title: playlistTitle.trim() }) });
    setPlaylistTitle("");
    loadPlaylists();
  }

  async function deletePlaylist(id: number) {
    if (!confirm("Delete this playlist?")) return;
    await api(`/api/playlists/${id}`, { method: "DELETE" });
    if (managingPlaylistId === id) setManagingPlaylistId(null);
    loadPlaylists();
  }

  async function openPlaylistManage(playlist: MyPlaylist) {
    setManagingPlaylistId(playlist.id);
    setManagingPlaylistSlug(playlist.slug);
    const detail = await api<{ items: PlaylistDetailItem[] }>(`/api/playlists/${playlist.slug}`);
    setPlaylistItems(detail.items);
  }

  async function searchTracks() {
    if (!trackQuery.trim()) return;
    const results = await api<TrackSearchResult[]>(`/api/tracks/search?q=${encodeURIComponent(trackQuery.trim())}`);
    setTrackResults(results);
  }

  async function addOfficialTrackToPlaylist(trackId: number) {
    if (!managingPlaylistId) return;
    await api(`/api/playlists/${managingPlaylistId}/items`, { method: "POST", body: JSON.stringify({ trackId }) });
    const playlist = playlists.find((p) => p.id === managingPlaylistId);
    if (playlist) openPlaylistManage(playlist);
  }

  async function addCommunityTrackToPlaylist() {
    if (!managingPlaylistId || !communityTrackChoice) return;
    await api(`/api/playlists/${managingPlaylistId}/items`, { method: "POST", body: JSON.stringify({ communityTrackId: communityTrackChoice }) });
    setCommunityTrackChoice("");
    const playlist = playlists.find((p) => p.id === managingPlaylistId);
    if (playlist) openPlaylistManage(playlist);
  }

  async function removePlaylistItem(itemId: number) {
    await api(`/api/playlist-items/${itemId}`, { method: "DELETE" });
    const playlist = playlists.find((p) => p.id === managingPlaylistId);
    if (playlist) openPlaylistManage(playlist);
  }

  // Every community track across all of the user's own albums, for the
  // "add from my own uploads" dropdown when managing a playlist.
  const [myCommunityTracks, setMyCommunityTracks] = useState<{ id: number; title: string; albumTitle: string }[]>([]);
  useEffect(() => {
    if (albums.length === 0) {
      setMyCommunityTracks([]);
      return;
    }
    Promise.all(
      albums.map((a) =>
        api<{ tracks: { id: number; title: string }[] }>(`/api/community-albums/${a.slug}`).then((d) =>
          d.tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: a.title })),
        ),
      ),
    ).then((lists) => setMyCommunityTracks(lists.flat()));
  }, [albums]);

  return (
    <div style={{ maxWidth: 720 }}>
      {!user ? (
        <>
          <h1>My Music</h1>
          <p>
            <Link to="/login">Log in</Link> to upload your own music and build playlists.
          </p>
        </>
      ) : (
        <>
      <h1>My Music</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Upload your own tracks, organize them into albums, and build playlists mixing your uploads with anything from
        Exomusica's own catalog. Your playlists show up for everyone in <Link to="/cult">Cult Activities</Link>.
      </p>

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>My Albums</h2>
      <form onSubmit={createAlbum} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input placeholder="Album title" value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} />
        <input placeholder="Composer / artist name" value={albumComposer} onChange={(e) => setAlbumComposer(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Create album
        </button>
      </form>

      {albums.map((a) => (
        <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "0.6rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link to={`/community-album/${a.slug}`}>{a.title}</Link>
            <div
              tabIndex={0}
              onPaste={(e) => handleCoverPaste(e, a.id)}
              title="Click here, then Ctrl+V / Cmd+V to paste an image directly"
              style={{ display: "flex", gap: "0.4rem", alignItems: "center", outline: "none", border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "0.2rem 0.4rem" }}
            >
              <input ref={coverInputRef} type="file" accept="image/*" style={{ fontSize: "0.7rem", width: 90 }} />
              <button className="btn" onClick={() => uploadCover(a.id)} disabled={coverUploadingAlbumId === a.id}>
                {coverUploadingAlbumId === a.id ? "Uploading…" : "Set cover"}
              </button>
              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>or click here + paste</span>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.3rem" }}>
              <button className="btn" onClick={() => openAlbumManage(a)}>
                Manage tracks
              </button>
              <button className="btn btn-danger" onClick={() => deleteAlbum(a.id)}>
                Delete
              </button>
            </div>
          </div>

          {managingAlbumId === a.id && (
            <div style={{ marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
              {albumTracks.map((t) => (
                <div key={t.id} style={{ fontSize: "0.9rem", marginBottom: "0.3rem" }}>
                  {editingTrackId === t.id ? (
                    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" style={{ fontSize: "0.85rem" }} />
                      <input value={editComposer} onChange={(e) => setEditComposer(e.target.value)} placeholder="Composer (optional)" style={{ fontSize: "0.85rem" }} />
                      <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={() => saveTrackEdit(a.id)}>
                        save
                      </button>
                      <button className="btn" style={{ fontSize: "0.75rem" }} onClick={() => setEditingTrackId(null)}>
                        cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>
                        {t.title}
                        {t.composer && <span style={{ color: "var(--text-dim)" }}> — {t.composer}</span>}
                      </span>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button className="btn" style={{ fontSize: "0.75rem" }} onClick={() => startEditTrack(t)}>
                          edit
                        </button>
                        <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => deleteTrack(t.id, a.id)}>
                          remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <input placeholder="Track title" value={newTrackTitle} onChange={(e) => setNewTrackTitle(e.target.value)} />
                <div>
                  <label style={{ fontSize: "0.75rem" }}>How others may use this track</label>
                  <select value={newTrackPermission} onChange={(e) => setNewTrackPermission(e.target.value as typeof newTrackPermission)}>
                    <option value="LISTEN_ONLY">Listening only</option>
                    <option value="CREDIT_REQUIRED">Remix OK with credit</option>
                    <option value="FREE_REMIX">Free to remix</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem" }}>Is this a remix of another community track? (optional)</label>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <input placeholder="Search…" value={remixQuery} onChange={(e) => setRemixQuery(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn" onClick={searchRemixSource} type="button">
                      Search
                    </button>
                  </div>
                  {remixOfId && <div style={{ fontSize: "0.75rem", color: "var(--accent-forum)" }}>Selected — clear by picking another or reloading.</div>}
                  {remixResults.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                      <span>
                        {r.title} — {r.albumTitle}
                      </span>
                      <button className="btn" style={{ fontSize: "0.7rem" }} type="button" onClick={() => setRemixOfId(r.id)}>
                        select
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    placeholder="or paste a URL (e.g. archive.org)"
                    value={newTrackUrl}
                    onChange={(e) => setNewTrackUrl(e.target.value)}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button className="btn" onClick={() => addTrackByUrl(a.id)} disabled={!newTrackUrl.trim()}>
                    Add by URL
                  </button>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input ref={fileInputRef} type="file" accept="audio/*" style={{ fontSize: "0.8rem" }} />
                  <button className="btn" onClick={() => uploadTrack(a.id)}>
                    Upload file
                  </button>
                </div>
                {uploadError && <p style={{ color: "var(--accent-forum)", fontSize: "0.8rem" }}>{uploadError}</p>}
              </div>
            </div>
          )}
        </div>
      ))}

      <h2 style={{ fontSize: "1.1rem", marginTop: "2rem" }}>My Playlists</h2>
      <form onSubmit={createPlaylist} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input placeholder="Playlist title" value={playlistTitle} onChange={(e) => setPlaylistTitle(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Create playlist
        </button>
      </form>

      {playlists.map((p) => (
        <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "0.6rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link to={`/playlist/${p.slug}`}>{p.title}</Link>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button className="btn" onClick={() => openPlaylistManage(p)}>
                Manage tracks
              </button>
              <button className="btn btn-danger" onClick={() => deletePlaylist(p.id)}>
                Delete
              </button>
            </div>
          </div>

          {managingPlaylistId === p.id && (
            <div style={{ marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
              {playlistItems.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem", marginBottom: "0.3rem" }}>
                  <span>
                    {item.title} <span style={{ color: "var(--text-dim)" }}>— {item.albumTitle}</span>
                  </span>
                  <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => removePlaylistItem(item.id)}>
                    remove
                  </button>
                </div>
              ))}

              <div style={{ marginTop: "0.6rem" }}>
                <label style={{ fontSize: "0.8rem" }}>Add one of your own tracks</label>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <select
                    value={communityTrackChoice}
                    onChange={(e) => setCommunityTrackChoice(e.target.value ? Number(e.target.value) : "")}
                    style={{ flex: 1 }}
                  >
                    <option value="">— select —</option>
                    {myCommunityTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} — {t.albumTitle}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={addCommunityTrackToPlaylist}>
                    Add
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "0.6rem" }}>
                <label style={{ fontSize: "0.8rem" }}>Add an Exomusica track</label>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input placeholder="Search title or album…" value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn" onClick={searchTracks}>
                    Search
                  </button>
                </div>
                {trackResults.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", marginTop: "0.3rem" }}>
                    <span>
                      {t.title} <span style={{ color: "var(--text-dim)" }}>— {t.albumTitle}</span>
                    </span>
                    <button className="btn" style={{ fontSize: "0.75rem" }} onClick={() => addOfficialTrackToPlaylist(t.id)}>
                      add
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
                <Link className="btn" to={`/playlist/${managingPlaylistSlug}`}>
                  View as spacemap
                </Link>
              </div>
            </div>
          )}
        </div>
      ))}
        </>
      )}
    </div>
  );
}
