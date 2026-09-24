import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function adminAllTracksRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/all-tracks", { preHandler: requireAdmin }, async () => {
    const [officialTracks, communityTracks] = await Promise.all([
      prisma.track.findMany({
        include: {
          album: { select: { title: true, slug: true, composer: true, branch: { select: { name: true } } } },
          collaborators: { include: { collaborator: { select: { name: true } } } },
        },
        orderBy: { id: "asc" },
      }),
      prisma.communityTrack.findMany({
        include: { album: { select: { title: true, slug: true, composer: true, owner: { select: { username: true } } } }, attachment: { select: { id: true } } },
        orderBy: { id: "asc" },
      }),
    ]);

    const official = officialTracks.map((t) => ({
      id: t.id,
      kind: "official" as const,
      title: t.title,
      composer: t.collaborators.map((c) => c.collaborator.name).join(", ") || t.album.composer,
      albumTitle: t.album.title,
      albumSlug: t.album.slug,
      branchName: t.album.branch?.name ?? null,
      owner: null as string | null,
      genres: t.genres,
      lyrics: t.lyrics,
      fileUrl: t.fileUrl,
      format: t.format,
      durationSeconds: t.durationSeconds,
      position: t.position,
    }));

    const community = communityTracks.map((t) => ({
      id: t.id,
      kind: "community" as const,
      title: t.title,
      composer: t.composer ?? t.album.composer,
      albumTitle: t.album.title,
      albumSlug: t.album.slug,
      branchName: null as string | null,
      owner: t.album.owner.username,
      genres: t.genres,
      lyrics: t.lyrics,
      fileUrl: t.attachment ? null : t.externalUrl, // attachment-backed tracks have no meaningful external URL to show
      format: t.format,
      durationSeconds: t.durationSeconds,
      position: t.position,
    }));

    return [...official, ...community];
  });
}
