import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, verifyToken } from "../lib/auth.js";
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

async function canEditPlaylist(playlistId: number, userId: number, ownerId: number): Promise<boolean> {
  if (ownerId === userId) return true;
  const collab = await prisma.playlistCollaborator.findUnique({ where: { playlistId_userId: { playlistId, userId } } });
  return !!collab;
}

export async function communityMusicRoutes(app: FastifyInstance): Promise<void> {
  // --- Admin spotlight -------------------------------------------------

  app.get("/api/community/spotlight", async () => {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { spotlightCommunityTrackId: true } });
    if (!settings?.spotlightCommunityTrackId) return null;
    const track = await prisma.communityTrack.findUnique({
      where: { id: settings.spotlightCommunityTrackId },
      include: { album: { select: { slug: true, title: true, coverArtUrl: true, owner: { select: { username: true } } } } },
    });
    if (!track) return null;
    return { id: track.id, title: track.title, albumTitle: track.album.title, albumSlug: track.album.slug, coverArtUrl: track.album.coverArtUrl, owner: track.album.owner.username };
  });

  app.put<{ Body: { trackId: number | null } }>("/api/admin/community/spotlight", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, spotlightCommunityTrackId: req.body.trackId },
      update: { spotlightCommunityTrackId: req.body.trackId },
    });
    return { status: "ok" };
  });

  app.get<{ Querystring: { q?: string } }>("/api/community-tracks/search", async (req) => {
    const q = req.query.q?.trim();
    if (!q) return [];
    const tracks = await prisma.communityTrack.findMany({
      where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { album: { title: { contains: q, mode: "insensitive" } } }] },
      select: { id: true, title: true, album: { select: { title: true } } },
      take: 20,
    });
    return tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: t.album.title }));
  });

  // --- Search for adding official tracks to a playlist ---------------------

  app.get<{ Querystring: { q?: string } }>("/api/tracks/search", async (req) => {
    const q = req.query.q?.trim();
    if (!q) return [];
    const tracks = await prisma.track.findMany({
      where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { album: { title: { contains: q, mode: "insensitive" } } }] },
      select: { id: true, title: true, album: { select: { title: true, coverArtUrl: true } } },
      take: 20,
    });
    return tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: t.album.title, coverArtUrl: t.album.coverArtUrl }));
  });

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
        tracks: {
          orderBy: { position: "asc" },
          include: { attachment: { select: { storagePath: true } }, _count: { select: { likes: true } }, remixOf: { select: { title: true, album: { select: { slug: true } } } } },
        },
      },
    });
    if (!album) return reply.code(404).send({ error: "no such album" });
    const viewerId = optionalUserId(req);
    const myLikes = viewerId
      ? new Set((await prisma.communityTrackLike.findMany({ where: { userId: viewerId, trackId: { in: album.tracks.map((t) => t.id) } }, select: { trackId: true } })).map((l) => l.trackId))
      : new Set<number>();
    return {
      ...album,
      tracks: album.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        fileUrl: t.attachment?.storagePath ?? t.externalUrl ?? "",
        format: t.format,
        durationSeconds: t.durationSeconds,
        position: t.position,
        albumTitle: album.title,
        albumSlug: album.slug,
        coverArtUrl: album.coverArtUrl,
        composer: album.composer,
        branchSlug: null,
        bookmarks: [],
        permission: t.permission,
        likeCount: t._count.likes,
        likedByMe: myLikes.has(t.id),
        remixOf: t.remixOf ? { title: t.remixOf.title, albumSlug: t.remixOf.album.slug } : null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/community-tracks/:id/like", { preHandler: requireAuth }, async (req, reply) => {
    const trackId = Number(req.params.id);
    const existing = await prisma.communityTrackLike.findUnique({ where: { trackId_userId: { trackId, userId: req.user!.id } } });
    if (existing) {
      await prisma.communityTrackLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    try {
      await prisma.communityTrackLike.create({ data: { trackId, userId: req.user!.id } });
      return reply.code(201).send({ liked: true });
    } catch {
      return reply.code(404).send({ error: "no such track" });
    }
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
      const permissionField = file.fields.permission;
      const permission = permissionField && "value" in permissionField ? String(permissionField.value) : "LISTEN_ONLY";
      const remixOfField = file.fields.remixOfId;
      const remixOfId = remixOfField && "value" in remixOfField && remixOfField.value ? Number(remixOfField.value) : null;
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
          permission: permission as "LISTEN_ONLY" | "CREDIT_REQUIRED" | "FREE_REMIX",
          remixOfId,
        },
      });
      void probeAudioDuration(attachment.storagePath)
        .then((seconds) => {
          if (seconds) return prisma.communityTrack.update({ where: { id: track.id }, data: { durationSeconds: seconds } });
        })
        .catch(() => {});
      return reply.code(201).send(track);
    }

    const { title, url, permission, remixOfId } = (req.body ?? {}) as { title?: string; url?: string; permission?: string; remixOfId?: number };
    if (!title || !url) return reply.code(400).send({ error: "title and url are required" });
    const position = await prisma.communityTrack.count({ where: { albumId: album.id } });
    const track = await prisma.communityTrack.create({
      data: {
        albumId: album.id,
        title,
        externalUrl: url,
        format: "MP3",
        position,
        permission: (permission as "LISTEN_ONLY" | "CREDIT_REQUIRED" | "FREE_REMIX") ?? "LISTEN_ONLY",
        remixOfId: remixOfId ?? null,
      },
    });
    void probeAudioDuration(url)
      .then((seconds) => {
        if (seconds) return prisma.communityTrack.update({ where: { id: track.id }, data: { durationSeconds: seconds } });
      })
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
      return prisma.playlist.findMany({
        where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
        orderBy: { createdAt: "desc" },
      });
    }
    const playlists = await prisma.playlist.findMany({
      select: {
        slug: true,
        title: true,
        description: true,
        createdAt: true,
        owner: { select: { username: true } },
        items: {
          select: {
            track: { select: { albumId: true } },
            communityTrack: { select: { albumId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return playlists.map((p) => {
      const albumKeys = new Set(p.items.map((i) => (i.track ? `o:${i.track.albumId}` : `c:${i.communityTrack!.albumId}`)));
      return {
        slug: p.slug,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        owner: p.owner.username,
        trackCount: p.items.length,
        albumCount: albumKeys.size,
      };
    });
  });

  app.get<{ Params: { slug: string } }>("/api/playlists/:slug", async (req, reply) => {
    const playlist = await prisma.playlist.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { username: true } },
        collaborators: { include: { user: { select: { id: true, username: true } } } },
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
    const items = playlist.items.map((item) => {
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
    });
    // Distinct albums referenced by this playlist's tracks — the
    // node-equivalent for the spacemap view (an album here plays the same
    // role a branch plays on the main map).
    const albumsBySlug = new Map<string, { slug: string; title: string; coverArtUrl: string | null; source: "official" | "community" }>();
    for (const item of items) {
      const key = `${item.source}:${item.albumSlug}`;
      if (!albumsBySlug.has(key)) {
        albumsBySlug.set(key, { slug: item.albumSlug, title: item.albumTitle, coverArtUrl: item.coverArtUrl, source: item.source });
      }
    }
    return {
      id: playlist.id,
      slug: playlist.slug,
      title: playlist.title,
      description: playlist.description,
      owner: playlist.owner.username,
      ownerId: playlist.ownerId,
      collaborators: playlist.collaborators.map((c) => ({ id: c.user.id, username: c.user.username })),
      fxSettings: playlist.fxSettingsJson,
      albums: [...albumsBySlug.values()],
      items,
    };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/playlists/:id/fx-settings",
    { preHandler: requireAuth },
    async (req, reply) => {
      const playlist = await prisma.playlist.findUnique({ where: { id: Number(req.params.id) } });
      if (!playlist) return reply.code(404).send({ error: "no such playlist" });
      if (playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "not your playlist" });
      const updated = await prisma.playlist.update({ where: { id: playlist.id }, data: { fxSettingsJson: req.body ?? {} } });
      return { fxSettings: updated.fxSettingsJson };
    },
  );

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
      if (!(await canEditPlaylist(playlist.id, req.user!.id, playlist.ownerId))) return reply.code(403).send({ error: "not your playlist" });
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
    if (!(await canEditPlaylist(item.playlist.id, req.user!.id, item.playlist.ownerId))) return reply.code(403).send({ error: "not your playlist" });
    await prisma.playlistItem.delete({ where: { id: item.id } });
    return { status: "ok" };
  });

  // --- Playlist collaborators (owner-only to manage) ------------------------

  app.post<{ Params: { id: string }; Body: { username: string } }>("/api/playlists/:id/collaborators", { preHandler: requireAuth }, async (req, reply) => {
    const playlist = await prisma.playlist.findUnique({ where: { id: Number(req.params.id) } });
    if (!playlist) return reply.code(404).send({ error: "no such playlist" });
    if (playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "only the owner can add collaborators" });
    const target = await prisma.user.findFirst({ where: { username: { equals: req.body?.username, mode: "insensitive" }, isGhost: false } });
    if (!target) return reply.code(404).send({ error: "no such user" });
    if (target.id === playlist.ownerId) return reply.code(400).send({ error: "already the owner" });
    try {
      await prisma.playlistCollaborator.create({ data: { playlistId: playlist.id, userId: target.id } });
    } catch {
      return reply.code(409).send({ error: "already a collaborator" });
    }
    return reply.code(201).send({ status: "ok" });
  });

  app.delete<{ Params: { id: string; userId: string } }>("/api/playlists/:id/collaborators/:userId", { preHandler: requireAuth }, async (req, reply) => {
    const playlist = await prisma.playlist.findUnique({ where: { id: Number(req.params.id) } });
    if (!playlist) return reply.code(404).send({ error: "no such playlist" });
    if (playlist.ownerId !== req.user!.id) return reply.code(403).send({ error: "only the owner can remove collaborators" });
    await prisma.playlistCollaborator.deleteMany({ where: { playlistId: playlist.id, userId: Number(req.params.userId) } });
    return { status: "ok" };
  });
}
