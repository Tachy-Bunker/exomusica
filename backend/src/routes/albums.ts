import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { trackToDTO } from "../lib/embeds.js";
import { saveSiteImage, saveGalleryFile } from "../lib/storage.js";

export async function albumRoutes(app: FastifyInstance): Promise<void> {
  // Every track site-wide, shuffled server-side — powers the homepage's
  // "Shuffle play" button. Capped well above any realistic catalog size,
  // just as a sanity limit rather than a real constraint.
  app.get("/api/tracks/shuffle", async () => {
    const tracks = await prisma.track.findMany({
      include: { album: { include: { branch: true } }, bookmarks: true, collaborators: { include: { collaborator: true } } },
      take: 500,
    });
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map(trackToDTO);
  });

  // One branch's tracks, shuffled — powers the reticle lock-on "F" action
  // in the space map (distinct from /api/tracks/shuffle, which is sitewide).
  app.get<{ Params: { slug: string } }>("/api/branches/:slug/tracks/shuffle", async (req, reply) => {
    const branch = await prisma.branch.findUnique({ where: { slug: req.params.slug } });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    const albums = await prisma.album.findMany({ where: { branchId: branch.id }, select: { id: true } });
    const tracks = await prisma.track.findMany({
      where: { albumId: { in: albums.map((a) => a.id) } },
      include: { album: { include: { branch: true } }, bookmarks: true, collaborators: { include: { collaborator: true } } },
    });
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map(trackToDTO);
  });

  app.get<{ Params: { slug: string } }>("/api/albums/:slug", async (req, reply) => {
    const album = await prisma.album.findUnique({
      where: { slug: req.params.slug },
      include: {
        branch: { select: { slug: true, name: true } },
        collaborators: { include: { collaborator: true } },
        links: { orderBy: { position: "asc" } },
        galleryImages: { orderBy: { position: "asc" } },
        tracks: {
          orderBy: { position: "asc" },
          include: {
            album: { include: { branch: true } },
            bookmarks: true,
            collaborators: { include: { collaborator: true } },
          },
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
      branch: album.branch,
      links: album.links,
      gallery: album.galleryImages,
      collaborators: album.collaborators.map((c) => c.collaborator),
      tracks: album.tracks.map((t) => ({
        ...trackToDTO(t),
        composers: t.collaborators.map((tc) => ({ id: tc.collaborator.id, name: tc.collaborator.name })),
      })),
    };
  });

  app.post<{
    Body: { branchId: number; slug: string; title: string; composer: string; description?: string };
  }>("/api/admin/albums", { preHandler: requireAdmin }, async (req, reply) => {
    const { branchId, slug, title, composer, description } = req.body ?? {};
    if (!branchId || !slug || !title || !composer) {
      return reply.code(400).send({ error: "branchId, slug, title, and composer are required" });
    }
    const album = await prisma.album.create({ data: { branchId, slug, title, composer, description } });
    return reply.code(201).send(album);
  });

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; composer: string; description: string; contentMarkdown: string }> }>(
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

  // --- Cover art + gallery ---------------------------------------------
  app.post<{ Params: { id: string } }>(
    "/api/admin/albums/:id/cover",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      const buffer = await file.toBuffer();
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "albums");
      const album = await prisma.album.update({ where: { id: Number(req.params.id) }, data: { coverArtUrl: url } });
      return { coverArtUrl: album.coverArtUrl };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/albums/:id/gallery",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const albumId = Number(req.params.id);
      const created = [];
      let position = await prisma.albumGalleryImage.count({ where: { albumId } });
      for await (const file of req.files()) {
        const buffer = await file.toBuffer();
        const { url } = await saveGalleryFile(file.filename, file.mimetype, buffer);
        created.push(await prisma.albumGalleryImage.create({ data: { albumId, url, position: position++ } }));
      }
      if (created.length === 0) return reply.code(400).send({ error: "no files uploaded" });
      return reply.code(201).send(created);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/gallery-images/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.albumGalleryImage.delete({ where: { id: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );

  // --- Streaming/download links (named, unlimited) -----------------------
  app.post<{ Params: { id: string }; Body: { label: string; url: string } }>(
    "/api/admin/albums/:id/links",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { label, url } = req.body ?? {};
      if (!label || !url) return reply.code(400).send({ error: "label and url are required" });
      const albumId = Number(req.params.id);
      const position = await prisma.albumLink.count({ where: { albumId } });
      const link = await prisma.albumLink.create({ data: { albumId, label, url, position } });
      return reply.code(201).send(link);
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/album-links/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.albumLink.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  // --- Tracks -------------------------------------------------------------
  app.post<{
    Params: { id: string };
    Body: { title: string; fileUrl: string; format: string; durationSeconds?: number; position?: number };
  }>("/api/admin/albums/:id/tracks", { preHandler: requireAdmin }, async (req, reply) => {
    const { title, fileUrl, format, durationSeconds, position } = req.body ?? {};
    if (!title || !fileUrl || !format) {
      return reply.code(400).send({ error: "title, fileUrl, and format are required" });
    }
    const albumId = Number(req.params.id);
    const resolvedPosition = position ?? (await prisma.track.count({ where: { albumId } }));
    const track = await prisma.track.create({
      data: {
        albumId,
        title,
        fileUrl,
        format: format as never, // validated against the AudioFormat enum by Prisma at the DB layer
        durationSeconds,
        position: resolvedPosition,
      },
    });
    return reply.code(201).send(track);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; fileUrl: string; format: string; durationSeconds: number }>;
  }>("/api/admin/tracks/:id", { preHandler: requireAdmin }, async (req) => {
    return prisma.track.update({
      where: { id: Number(req.params.id) },
      data: req.body as never, // format, if present, is validated against the AudioFormat enum at the DB layer
    });
  });

  // Swaps two tracks' positions — same pattern as About-feature reordering:
  // move one item up/down at a time rather than sending a full reordered list.
  app.post<{ Body: { idA: number; idB: number } }>(
    "/api/admin/tracks/swap",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { idA, idB } = req.body ?? {};
      const [a, b] = await Promise.all([
        prisma.track.findUnique({ where: { id: idA } }),
        prisma.track.findUnique({ where: { id: idB } }),
      ]);
      if (!a || !b) return reply.code(404).send({ error: "track not found" });
      await prisma.$transaction([
        prisma.track.update({ where: { id: a.id }, data: { position: b.position } }),
        prisma.track.update({ where: { id: b.id }, data: { position: a.position } }),
      ]);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/tracks/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.track.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  // Full replace, not incremental add/remove — the admin UI sends the
  // complete checked set each time, simpler than diffing on both ends.
  app.put<{ Params: { id: string }; Body: { collaboratorIds: number[] } }>(
    "/api/admin/tracks/:id/composers",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const trackId = Number(req.params.id);
      const { collaboratorIds } = req.body ?? {};
      await prisma.$transaction([
        prisma.trackCollaborator.deleteMany({ where: { trackId } }),
        prisma.trackCollaborator.createMany({
          data: (collaboratorIds ?? []).map((collaboratorId) => ({ trackId, collaboratorId })),
        }),
      ]);
      return reply.code(204).send();
    },
  );

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

  // --- Collaborators --------------------------------------------------------
  // Collaborator creation/management now lives entirely in collaborators.ts
  // (it also generates a slug, which this older version never did) — this
  // duplicate registration at the same path was crashing the server on
  // every boot with FST_ERR_DUPLICATED_ROUTE.

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

  app.delete<{ Params: { id: string; collaboratorId: string } }>(
    "/api/admin/albums/:id/collaborators/:collaboratorId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const albumId = Number(req.params.id);
      const collaboratorId = Number(req.params.collaboratorId);
      // Clean up per-track composer credits for this collaborator on this
      // album's tracks too — otherwise a track could still credit someone
      // no longer listed as an album collaborator at all.
      await prisma.trackCollaborator.deleteMany({
        where: { collaboratorId, track: { albumId } },
      });
      await prisma.albumCollaborator.delete({
        where: { albumId_collaboratorId: { albumId, collaboratorId } },
      });
      return reply.code(204).send();
    },
  );
}
