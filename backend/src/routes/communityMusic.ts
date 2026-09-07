import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, verifyToken } from "../lib/auth.js";
import { saveCommunityTrackAudio } from "../lib/storage.js";
import { probeAudioDuration } from "../lib/audioProbe.js";

async function uniqueCommunityAlbumSlug(title: string): Promise<string> {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "album";
  let slug = base;
  let n = 1;
  while (await prisma.communityAlbum.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}
async function uniquePlaylistSlug(title: string): Promise<string> {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "playlist";
  let slug = base;
  let n = 1;
  while (await prisma.playlist.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

function formatFromMime(mimeType: string): "MP3" | "WAV" | "FLAC" | "OGG" | "AAC" {
  if (mimeType.includes("wav")) return "WAV";
  if (mimeType.includes("flac")) return "FLAC";
  if (mimeType.includes("ogg")) return "OGG";
  if (mimeType.includes("aac") || mimeType.includes("mp4")) return "AAC";
  return "MP3";
}

function optionalUserId(req: { headers: { authorization?: string } }): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7))?.id ?? null;
}

export async function communityMusicRoutes(app: FastifyInstance): Promise<void> {
  // --- Community albums ---------------------------------------------------

  app.get<{ Querystring: { mine?: string } }>("/api/community-albums", async (req) => {
    const mine = req.query.mine === "true";
    if (mine) {
      // requireAuth isn't on this route since it's also the public browse
      // endpoint — but "mine" obviously needs a logged-in user.
      const userId = optionalUserId(req);
      if (!userId) return [];
      return prisma.communityAlbum.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" } });
    }
    return prisma.communityAlbum.findMany({
      select: { slug: true, title: true, composer: true, coverArtUrl: true, createdAt: true, owner: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/community-albums/:slug", async (req, reply) => {
    const album = await prisma.communityAlbum.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { username: true } },
        tracks: { orderBy: { position: "asc" }, include: { attachment: { select: { storagePath: true } } } },
      },
    });
    if (!album) return reply.code(404).send({ error: "no such album" });
    return {
      ...album,
      tracks: album.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        fileUrl: t.attachment?.storagePath ?? t.externalUrl ?? "",
        format: t.format,
        durationSeconds: t.durationSeconds,
        position: t.position,
      })),
    };
  });

  app.post<{ Body: { title: string; composer: string; description?: string } }>(
    "/api/community-albums",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { title, composer, description } = req.body ?? {};
      if (!title || !composer) return reply.code(400).send({ error: "title and composer are required" });
      const slug = await uniqueCommunityAlbumSlug(title);
      const album = await prisma.communityAlbum.create({
        data: { ownerId: req.user!.id, slug, title, composer, description },
      });
      return reply.code(201).send(album);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; composer: string; description: string; coverArtUrl: string }> }>(
    "/api/community-albums/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const album = await prisma.communityAlbum.findUnique({ where: { id: Number(req.params.id) } });
      if (!album) return reply.code(404).send({ error: "no such album" });
      if (album.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your album" });
      return prisma.communityAlbum.update({ where: { id: album.id }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/community-albums/:id", { preHandler: requireAuth }, async (req, reply) => {
    const album = await prisma.communityAlbum.findUnique({ where: { id: Number(req.params.id) } });
    if (!album) return reply.code(404).send({ error: "no such album" });
    if (album.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your album" });
    await prisma.communityAlbum.delete({ where: { id: album.id } });
    return { status: "ok" };
  });

  // --- Community tracks ----------------------------------------------------

  // Multipart: either a "file" field (uploaded audio) OR a "url" field
  // (linking an already-hosted file) — exactly one, not both.
  app.post<{ Params: { id: string } }>("/api/community-albums/:id/tracks", { preHandler: requireAuth }, async (req, reply) => {
    const album = await prisma.communityAlbum.findUnique({ where: { id: Number(req.params.id) } });
    if (!album) return reply.code(404).send({ error: "no such album" });
    if (album.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your album" });

    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      const titleField = file.fields.title;
      const title = titleField && "value" in titleField ? String(titleField.value) : null;
      if (!title) return reply.code(400).send({ error: "title is required" });
      const buffer = await file.toBuffer();
      let attachment;
      try {
        attachment = await saveCommunityTrackAudio(req.user!.id, file.filename, file.mimetype, buffer);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
      }
      const position = await prisma.communityTrack.count({ where: { albumId: album.id } });
      const track = await prisma.communityTrack.create({
        data: {
          albumId: album.id,
          title,
          attachmentId: attachment.id,
          format: formatFromMime(file.mimetype),
          position,
        },
      });
      void probeAudioDuration(attachment.storagePath)
        .then((seconds) => seconds && prisma.communityTrack.update({ where: { id: track.id }, data: { durationSeconds: seconds } }))
        .catch(() => {});
      return reply.code(201).send(track);
    }

    const { title, url } = (req.body ?? {}) as { title?: string; url?: string };
    if (!title || !url) return reply.code(400).send({ error: "title and url are required" });
    const position = await prisma.communityTrack.count({ where: { albumId: album.id } });
    const track = await prisma.communityTrack.create({
      data: { albumId: album.id, title, externalUrl: url, format: "MP3", position },
    });
    void probeAudioDuration(url)
      .then((seconds) => seconds && prisma.communityTrack.update({ where: { id: track.id }, data: { durationSeconds: seconds } }))
      .catch(() => {});
    return reply.code(201).send(track);
  });

  app.delete<{ Params: { id: string } }>("/api/community-tracks/:id", { preHandler: requireAuth }, async (req, reply) => {
    const track = await prisma.communityTrack.findUnique({ where: { id: Number(req.params.id) }, include: { album: true } });
    if (!track) return reply.code(404).send({ error: "no such track" });
    if (track.album.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your track" });
    await prisma.communityTrack.delete({ where: { id: track.id } });
    return { status: "ok" };
  });

  // --- Playlists ------------------------------------------------------------

  app.get<{ Querystring: { mine?: string } }>("/api/playlists", async (req) => {
    if (req.query.mine === "true") {
      const userId = optionalUserId(req);
      if (!userId) return [];
      return prisma.playlist.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" } });
    }
    return prisma.playlist.findMany({
      select: { slug: true, title: true, description: true, createdAt: true, owner: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/playlists/:slug", async (req, reply) => {
    const playlist = await prisma.playlist.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { username: true } },
        items: {
          orderBy: { position: "asc" },
          include: {
            track: { include: { album: { select: { slug: true, title: true, coverArtUrl: true, branch: { select: { slug: true } } } } } },
            communityTrack: { include: { album: { select: { slug: true, title: true, coverArtUrl: true } }, attachment: { select: { storagePath: true } } } },
          },
        },
      },
    });
    if (!playlist) return reply.code(404).send({ error: "no such playlist" });
    return {
      slug: playlist.slug,
      title: playlist.title,
      description: playlist.description,
      owner: playlist.owner.username,
      items: playlist.items.map((item) => {
        if (item.track) {
          return {
            id: item.id,
            source: "official" as const,
            trackId: item.track.id,
            title: item.track.title,
            fileUrl: item.track.fileUrl,
            durationSeconds: item.track.durationSeconds,
            albumTitle: item.track.album.title,
            albumSlug: item.track.album.slug,
            coverArtUrl: item.track.album.coverArtUrl,
            branchSlug: item.track.album.branch?.slug ?? null,
          };
        }
        const ct = item.communityTrack!;
        return {
          id: item.id,
          source: "community" as const,
          trackId: ct.id,
          title: ct.title,
          fileUrl: ct.attachment?.storagePath ?? ct.externalUrl ?? "",
          durationSeconds: ct.durationSeconds,
          albumTitle: ct.album.title,
          albumSlug: ct.album.slug,
          coverArtUrl: ct.album.coverArtUrl,
          branchSlug: null,
        };
      }),
    };
  });

  app.post<{ Body: { title: string; description?: string } }>("/api/playlists", { preHandler: requireAuth }, async (req, reply) => {
    const { title, description } = req.body ?? {};
    if (!title) return reply.code(400).send({ error: "title is required" });
    const slug = await uniquePlaylistSlug(title);
    const playlist = await prisma.playlist.create({ data: { ownerId: req.user!.id, slug, title, description } });
    return reply.code(201).send(playlist);
  });

  app.delete<{ Params: { id: string } }>("/api/playlists/:id", { preHandler: requireAuth }, async (req, reply) => {
    const playlist = await prisma.playlist.findUnique({ where: { id: Number(req.params.id) } });
    if (!playlist) return reply.code(404).send({ error: "no such playlist" });
    if (playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your playlist" });
    await prisma.playlist.delete({ where: { id: playlist.id } });
    return { status: "ok" };
  });

  app.post<{ Params: { id: string }; Body: { trackId?: number; communityTrackId?: number } }>(
    "/api/playlists/:id/items",
    { preHandler: requireAuth },
    async (req, reply) => {
      const playlist = await prisma.playlist.findUnique({ where: { id: Number(req.params.id) } });
      if (!playlist) return reply.code(404).send({ error: "no such playlist" });
      if (playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your playlist" });
      const { trackId, communityTrackId } = req.body ?? {};
      if (!trackId && !communityTrackId) return reply.code(400).send({ error: "trackId or communityTrackId is required" });
      const position = await prisma.playlistItem.count({ where: { playlistId: playlist.id } });
      const item = await prisma.playlistItem.create({
        data: { playlistId: playlist.id, trackId: trackId ?? null, communityTrackId: communityTrackId ?? null, position },
      });
      return reply.code(201).send(item);
    },
  );

  app.delete<{ Params: { id: string } }>("/api/playlist-items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const item = await prisma.playlistItem.findUnique({ where: { id: Number(req.params.id) }, include: { playlist: true } });
    if (!item) return reply.code(404).send({ error: "no such item" });
    if (item.playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your playlist" });
    await prisma.playlistItem.delete({ where: { id: item.id } });
    return { status: "ok" };
  });
}
