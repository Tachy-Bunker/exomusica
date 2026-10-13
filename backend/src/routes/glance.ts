import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

/** What a member is up to, from public things only: their latest study and their latest approved/own community track. For the card that opens on an @mention. */
export async function glanceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { username: string } }>("/api/users/:username/glance", async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { username: req.params.username }, select: { id: true, isGhost: true, deletedAt: true, bio: true } });
    if (!user || user.isGhost || user.deletedAt) return reply.code(404).send({ error: "no such user" });
    const [study, track] = await Promise.all([
      prisma.study.findFirst({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, select: { slug: true, title: true, status: true } }),
      prisma.communityTrack.findFirst({
        where: { album: { ownerId: user.id, OR: [{ submissionStatus: null }, { submissionStatus: "APPROVED" }] } },
        orderBy: { id: "desc" },
        select: { title: true, album: { select: { slug: true, title: true } } },
      }),
    ]);
    reply.header("cache-control", "public, max-age=60");
    return { bio: user.bio ? user.bio.slice(0, 140) : null, study, track: track ? { title: track.title, albumSlug: track.album.slug, albumTitle: track.album.title } : null };
  });
}
