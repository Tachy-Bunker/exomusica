import type { PlayableTrackDTO } from "./types";
/** The playlist API's items, turned into tracks the player can play, and the files that must be kept for them. No browser APIs here. */
export interface PlaylistItemLike {
  source: "official" | "community"; trackId: number; title: string; fileUrl: string; durationSeconds: number | null; albumTitle: string; albumSlug: string;
  coverArtUrl: string | null; composer: string | null; branchSlug: string | null; replayGainDb: number | null; genres: string[]; lyrics?: string | null; trackPosition?: number;
}
export function playlistTracks(items: PlaylistItemLike[], owner: string): PlayableTrackDTO[] {
  return items.map((i) => ({
    id: i.trackId, title: i.title, fileUrl: i.fileUrl, format: "MP3", durationSeconds: i.durationSeconds, position: i.trackPosition ?? 0, albumTitle: i.albumTitle, albumSlug: i.albumSlug,
    coverArtUrl: i.coverArtUrl, composer: i.composer ?? owner, branchSlug: i.branchSlug, bookmarks: [], replayGainDb: i.replayGainDb, source: i.source, genres: i.genres, lyrics: i.lyrics ?? null,
  } as PlayableTrackDTO));
}
/** Own-site files only, each once: covers and audio. */
export function filesOf(tracks: { fileUrl: string; coverArtUrl: string | null }[]): string[] {
  return [...new Set(tracks.flatMap((t) => [t.coverArtUrl ?? "", t.fileUrl]).filter((u) => u.startsWith("/")))];
}
/** What may be deleted when one pack goes: its files that no other pack still uses. */
export function freeable(gone: string[], others: string[][]): string[] {
  const keep = new Set(others.flat());
  return gone.filter((u) => !keep.has(u));
}
