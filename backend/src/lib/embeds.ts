import { prisma } from "./prisma.js";
import type { PlayableTrackDTO } from "./types.js";

type TrackWithRelations = Awaited<ReturnType<typeof fetchTracksByIds>>[number];

async function fetchTracksByIds(ids: number[]) {
  return prisma.track.findMany({
    where: { id: { in: ids } },
    include: { album: { include: { branch: true } }, bookmarks: true },
  });
}

export function trackToDTO(t: TrackWithRelations): PlayableTrackDTO {
  return {
    id: t.id,
    title: t.title,
    fileUrl: t.fileUrl,
    format: t.format,
    durationSeconds: t.durationSeconds,
    albumTitle: t.album.title,
    albumSlug: t.album.slug,
    composer: t.album.composer,
    branchSlug: t.album.branch.slug,
    bookmarks: t.bookmarks.map((b) => ({ label: b.label, timestampSeconds: b.timestampSeconds })),
  };
}

// Matches "track:42", "/t/42", or "/track/42" anywhere in a message.
// Deliberately independent of the frontend's eventual page-URL scheme —
// "track:ID" always works even before routing is decided.
const TRACK_REF = /(?:track:|\/t\/|\/track\/)(\d+)/g;

export async function resolveTrackEmbeds(content: string): Promise<PlayableTrackDTO[]> {
  const ids = new Set<number>();
  for (const match of content.matchAll(TRACK_REF)) {
    ids.add(Number(match[1]));
  }
  if (ids.size === 0) return [];
  const tracks = await fetchTracksByIds([...ids]);
  return tracks.map(trackToDTO);
}
