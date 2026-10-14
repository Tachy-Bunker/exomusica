import type { PlayableTrackDTO } from "./types";
import { filesOf, freeable, playlistTracks, type PlaylistItemLike } from "./offlinePlaylist";

// "Album pack": an album pinned for offline use - its tracks, cover and notes - kept in the browser's cache by the
// service worker (public/sw.js). Nothing is cached unless someone pins it, and unpinning frees it.

const PINNED = "exo-offline-v1";
const SHELL = "exo-shell-v1";
const ARMED = "exo-armed";
const KEY = "exomusica_offline_albums";

export interface PinnedAlbum { slug: string; title: string; composer: string; coverArtUrl: string | null; bytes: number; at: number; tracks: PlayableTrackDTO[] }

export const offlineSupported = (): boolean => typeof caches !== "undefined" && "serviceWorker" in navigator;

/** The worker exists only for people who pinned something: visitors who never press "Save offline" never get one. */
export function registerServiceWorker(): void {
  if (!offlineSupported() || !import.meta.env.PROD || listPinned().length === 0) return;
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
async function ensureWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  try { await navigator.serviceWorker.register("/sw.js"); await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 3000))]); } catch { /* audio still saves; only the offline app shell needs it */ }
}
async function dropWorker(): Promise<void> {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ignore */ }
}

export function listPinned(): PinnedAlbum[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function savePinned(list: PinnedAlbum[]): void { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } }
export const isPinned = (slug: string): boolean => listPinned().some((a) => a.slug === slug);

interface AlbumJson { slug: string; title: string; composer: string; coverArtUrl: string | null; gallery?: { url: string }[]; tracks: PlayableTrackDTO[] }

/** Downloads an album into the cache. `onProgress` gets 0..1. Throws with a readable message if it can't. */
export async function pinAlbum(slug: string, onProgress?: (f: number) => void): Promise<PinnedAlbum> {
  if (!offlineSupported()) throw new Error("This browser can't keep files for offline use.");
  const albumUrl = `/api/albums/${encodeURIComponent(slug)}`;
  const res = await fetch(albumUrl);
  if (!res.ok) throw new Error("Couldn't load the album.");
  const album = (await res.clone().json()) as AlbumJson;
  await navigator.storage?.persist?.().catch(() => false);
  await ensureWorker();
  const cache = await caches.open(PINNED);
  await caches.open(ARMED);
  await cache.put(albumUrl, res);
  const files = [...new Set([...(album.coverArtUrl ? [album.coverArtUrl] : []), ...(album.gallery ?? []).map((g) => g.url), ...album.tracks.map((t) => t.fileUrl)])].filter((u) => u.startsWith("/"));
  let bytes = 0;
  for (let i = 0; i < files.length; i++) {
    const r = await fetch(files[i]);
    if (!r.ok) throw new Error(`Couldn't download ${files[i].split("/").pop()}.`);
    bytes += Number(r.headers.get("content-length")) || 0;
    await cache.put(files[i], r);
    onProgress?.((i + 1) / files.length);
  }
  for (const t of album.tracks) { try { const pr = await fetch(`/api/tracks/${t.id}/provenance`); if (pr.ok) await cache.put(`/api/tracks/${t.id}/provenance`, pr); } catch { /* optional */ } }
  try { const shell = await fetch("/"); if (shell.ok) await (await caches.open(SHELL)).put("/index.html", shell); } catch { /* the app opens online anyway */ }
  const entry: PinnedAlbum = { slug: album.slug, title: album.title, composer: album.composer, coverArtUrl: album.coverArtUrl, bytes, at: Date.now(), tracks: album.tracks };
  savePinned([entry, ...listPinned().filter((a) => a.slug !== slug)]);
  return entry;
}

const PKEY = "exomusica_offline_playlists";
export interface PinnedPlaylist { slug: string; title: string; owner: string; bytes: number; at: number; tracks: PlayableTrackDTO[] }
export function listPinnedPlaylists(): PinnedPlaylist[] {
  try { const v = JSON.parse(localStorage.getItem(PKEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function savePinnedPlaylists(list: PinnedPlaylist[]): void { try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch { /* storage unavailable */ } }
export const isPlaylistPinned = (slug: string): boolean => listPinnedPlaylists().some((p) => p.slug === slug);
const albumFiles = (a: PinnedAlbum): string[] => filesOf([{ fileUrl: "", coverArtUrl: a.coverArtUrl }, ...a.tracks]);

interface PlaylistJson { slug: string; title: string; owner: string; items: PlaylistItemLike[] }
/** Keeps a whole playlist (official and community tracks) for offline use. Unlocked by the Offline cache milestone; the page decides whether to offer it. */
export async function pinPlaylist(slug: string, onProgress?: (f: number) => void): Promise<PinnedPlaylist> {
  if (!offlineSupported()) throw new Error("This browser can't keep files for offline use.");
  const url = `/api/playlists/${encodeURIComponent(slug)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load the playlist.");
  const pl = (await res.clone().json()) as PlaylistJson;
  const tracks = playlistTracks(pl.items, pl.owner);
  if (tracks.length === 0) throw new Error("This playlist has no tracks yet.");
  await navigator.storage?.persist?.().catch(() => false);
  await ensureWorker();
  const cache = await caches.open(PINNED);
  await caches.open(ARMED);
  await cache.put(url, res);
  const files = filesOf(tracks);
  let bytes = 0;
  for (let i = 0; i < files.length; i++) {
    const r = await fetch(files[i]);
    if (!r.ok) throw new Error(`Couldn't download ${files[i].split("/").pop()}.`);
    bytes += Number(r.headers.get("content-length")) || 0;
    await cache.put(files[i], r);
    onProgress?.((i + 1) / files.length);
  }
  for (const t of tracks) if (t.source === "official") { try { const pr = await fetch(`/api/tracks/${t.id}/provenance`); if (pr.ok) await cache.put(`/api/tracks/${t.id}/provenance`, pr); } catch { /* optional */ } }
  try { const shell = await fetch("/"); if (shell.ok) await (await caches.open(SHELL)).put("/index.html", shell); } catch { /* the app opens online anyway */ }
  const entry: PinnedPlaylist = { slug: pl.slug, title: pl.title, owner: pl.owner, bytes, at: Date.now(), tracks };
  savePinnedPlaylists([entry, ...listPinnedPlaylists().filter((p) => p.slug !== slug)]);
  return entry;
}

async function disarmIfEmpty(): Promise<void> {
  if (listPinned().length === 0 && listPinnedPlaylists().length === 0) { await caches.delete(ARMED); await caches.delete(SHELL); await caches.delete(PINNED); await dropWorker(); }
}

export async function unpinAlbum(slug: string): Promise<void> {
  const list = listPinned();
  const gone = list.find((a) => a.slug === slug);
  const rest = list.filter((a) => a.slug !== slug);
  savePinned(rest);
  if (!offlineSupported()) return;
  const cache = await caches.open(PINNED);
  if (gone) {
    const others = [...rest.map(albumFiles), ...listPinnedPlaylists().map((p) => filesOf(p.tracks))];
    for (const u of freeable(albumFiles(gone), others)) await cache.delete(u);
    for (const t of gone.tracks) await cache.delete(`/api/tracks/${t.id}/provenance`);
  }
  await cache.delete(`/api/albums/${encodeURIComponent(slug)}`);
  await disarmIfEmpty();
}

export async function unpinPlaylist(slug: string): Promise<void> {
  const list = listPinnedPlaylists();
  const gone = list.find((p) => p.slug === slug);
  const rest = list.filter((p) => p.slug !== slug);
  savePinnedPlaylists(rest);
  if (!offlineSupported()) return;
  const cache = await caches.open(PINNED);
  if (gone) {
    const others = [...listPinned().map(albumFiles), ...rest.map((p) => filesOf(p.tracks))];
    for (const u of freeable(filesOf(gone.tracks), others)) await cache.delete(u);
    for (const t of gone.tracks) if (t.source === "official" && !listPinned().some((a) => a.tracks.some((x) => x.id === t.id))) await cache.delete(`/api/tracks/${t.id}/provenance`);
  }
  await cache.delete(`/api/playlists/${encodeURIComponent(slug)}`);
  await disarmIfEmpty();
}

export async function usage(): Promise<{ used: number; quota: number } | null> {
  try { const e = await navigator.storage.estimate(); return { used: e.usage ?? 0, quota: e.quota ?? 0 }; } catch { return null; }
}

export const mb = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);
