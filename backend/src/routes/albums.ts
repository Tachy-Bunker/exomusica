import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { trackToDTO } from "../lib/embeds.js";

export async function albumRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>("/api/albums/:slug", async (req, reply) => {
    const album = await prisma.album.findUnique({
      where: { slug: req.params.slug },
      include: {
        branch: { select: { slug: true, name: true } },
        collaborators: { include: { collaborator: true } },
        tracks: {
          orderBy: { position: "asc" },
          include: { album: { include: { branch: true } }, bookmarks: true },
        },
      },
    });
    if (!album) return reply.code(404).send({ error: "no such album" });
    return {
      id: album.id,
      slug: album.slug,
      title: album.title,
      composer: album.composer,
      coverArtUrl: album.coverArtUrl,
      description: album.description,
      streamUrl: album.streamUrl,
      downloadUrl: album.downloadUrl,
      branch: album.branch,
      collaborators: album.collaborators.map((c) => c.collaborator),
      tracks: album.tracks.map(trackToDTO),
    };
  });

  app.post<{
    Body: {
      branchId: number;
      slug: string;
      title: string;
      composer: string;
      coverArtUrl?: string;
      description?: string;
      streamUrl?: string;
      downloadUrl?: string;
    };
  }>("/api/admin/albums", { preHandler: requireAdmin }, async (req, reply) => {
    const { branchId, slug, title, composer, coverArtUrl, description, streamUrl, downloadUrl } = req.body ?? {};
    if (!branchId || !slug || !title || !composer) {
      return reply.code(400).send({ error: "branchId, slug, title, and composer are required" });
    }
    const album = await prisma.album.create({
      data: { branchId, slug, title, composer, coverArtUrl, description, streamUrl, downloadUrl },
    });
    return reply.code(201).send(album);
  });

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; composer: string; coverArtUrl: string; description: string; streamUrl: string; downloadUrl: string }> }>(
    "/api/admin/albums/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.album.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/albums/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.album.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  app.post<{
    Params: { id: string };
    Body: { title: string; fileUrl: string; format: string; durationSeconds?: number; position?: number };
  }>("/api/admin/albums/:id/tracks", { preHandler: requireAdmin }, async (req, reply) => {
    const { title, fileUrl, format, durationSeconds, position } = req.body ?? {};
    if (!title || !fileUrl || !format) {
      return reply.code(400).send({ error: "title, fileUrl, and format are required" });
    }
    const track = await prisma.track.create({
      data: {
        albumId: Number(req.params.id),
        title,
        fileUrl,
        format: format as never, // validated against the AudioFormat enum by Prisma at the DB layer
        durationSeconds,
        position: position ?? 0,
      },
    });
    return reply.code(201).send(track);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/tracks/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.track.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: { label: string; timestampSeconds: number } }>(
    "/api/admin/tracks/:id/bookmarks",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { label, timestampSeconds } = req.body ?? {};
      if (!label || timestampSeconds === undefined) {
        return reply.code(400).send({ error: "label and timestampSeconds are required" });
      }
      const bookmark = await prisma.audioBookmark.create({
        data: { trackId: Number(req.params.id), label, timestampSeconds },
      });
      return reply.code(201).send(bookmark);
    },
  );

  app.post<{ Body: { name: string; role: string; bio?: string; pictureUrl?: string } }>(
    "/api/admin/collaborators",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { name, role, bio, pictureUrl } = req.body ?? {};
      if (!name || !role) return reply.code(400).send({ error: "name and role are required" });
      const collaborator = await prisma.collaborator.create({ data: { name, role, bio, pictureUrl } });
      return reply.code(201).send(collaborator);
    },
  );

  app.post<{ Params: { id: string }; Body: { collaboratorId: number } }>(
    "/api/admin/albums/:id/collaborators",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const albumId = Number(req.params.id);
      const { collaboratorId } = req.body ?? {};
      if (!collaboratorId) return reply.code(400).send({ error: "collaboratorId is required" });
      await prisma.albumCollaborator.upsert({
        where: { albumId_collaboratorId: { albumId, collaboratorId } },
        create: { albumId, collaboratorId },
        update: {},
      });
      return reply.code(204).send();
    },
  );
}
