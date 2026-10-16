import { prisma } from "./prisma.js";
import type { PlayableTrackDTO } from "./types.js";
import { trackRefIds } from "./trackRefs.js";

/** If fileUrl is our own storage (a relative /uploads/... path), returns
 *  it unchanged. If it's an absolute external URL, rewrites it to the
 *  same-origin audio-proxy path instead, so every consumer of this DTO
 *  — playback, ReplayGain analysis — sees a same-origin URL and never
 *  hits a CORS restriction, without needing to know or care that the
 *  underlying file actually lives elsewhere. */
export function resolvePlayableUrl(fileUrl: string, kind: "track" | "community-track", id: number): string {
  if (fileUrl.startsWith("/")) return fileUrl;
  return `/api/audio-proxy/${kind}/${id}`;
}

type TrackWithRelations = Awaited<ReturnType<typeof fetchTracksByIds>>[number];

async function fetchTracksByIds(ids: number[]) {
  return prisma.track.findMany({
    where: { id: { in: ids } },
    include: { album: { include: { branch: true } }, bookmarks: true, collaborators: { include: { collaborator: true } } },
  });
}

export function trackToDTO(t: TrackWithRelations): PlayableTrackDTO {
  const perTrackComposers = t.collaborators.map((c) => c.collaborator.name);
  return {
    id: t.id,
    title: t.title,
    fileUrl: resolvePlayableUrl(t.fileUrl, "track", t.id),
    format: t.format,
    durationSeconds: t.durationSeconds,
    position: t.position,
    albumTitle: t.album.title,
    albumSlug: t.album.slug,
    coverArtUrl: t.album.coverArtUrl,
    composer: perTrackComposers.length > 0 ? perTrackComposers.join(", ") : t.album.composer,
    branchSlug: t.album.branch.slug,
    bookmarks: t.bookmarks.map((b) => ({ label: b.label, timestampSeconds: b.timestampSeconds })),
    replayGainDb: t.replayGainDb,
    source: "official",
    genres: t.genres,
    lyrics: t.lyrics,
  };
}

/** Many tracks in one query. Missing or hidden ids are simply absent from the map. */
export async function tracksById(ids: number[]): Promise<Map<number, PlayableTrackDTO>> {
  const out = new Map<number, PlayableTrackDTO>();
  if (ids.length === 0) return out;
  for (const t of await fetchTracksByIds(ids)) out.set(t.id, trackToDTO(t));
  return out;
}

export async function resolveTrackEmbeds(content: string): Promise<PlayableTrackDTO[]> {
  const ids = trackRefIds(content);
  if (ids.length === 0) return [];
  const tracks = await fetchTracksByIds(ids);
  return tracks.map(trackToDTO);
}
