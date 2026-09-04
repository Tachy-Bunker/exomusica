import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSiteImage } from "../lib/storage.js";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "collaborator"
  );
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = slugify(base);
  let suffix = 1;
  while (true) {
    const existing = await prisma.collaborator.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${slugify(base)}-${suffix++}`;
  }
}

export async function collaboratorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/collaborators", async () => {
    return prisma.collaborator.findMany({
      select: { id: true, slug: true, name: true, role: true, bio: true, pictureUrl: true, links: true, position: true },
      orderBy: { position: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/collaborators/:slug", async (req, reply) => {
    const collaborator = await prisma.collaborator.findUnique({
      where: { slug: req.params.slug },
      include: {
        galleryImages: { orderBy: { position: "asc" } },
        linkedUser: { select: { username: true } },
        tracks: {
          include: {
            track: {
              include: {
                album: { select: { id: true, slug: true, title: true, coverArtUrl: true, branch: { select: { slug: true } } } },
              },
            },
          },
        },
      },
    });
    if (!collaborator) return reply.code(404).send({ error: "not found" });

    const albumMap = new Map<number, { slug: string; title: string; coverArtUrl: string | null; branchSlug: string; tracks: unknown[] }>();
    for (const tc of collaborator.tracks) {
      const album = tc.track.album;
      if (!albumMap.has(album.id)) {
        albumMap.set(album.id, { slug: album.slug, title: album.title, coverArtUrl: album.coverArtUrl, branchSlug: album.branch.slug, tracks: [] });
      }
      albumMap.get(album.id)!.tracks.push({
        id: tc.track.id,
        title: tc.track.title,
        fileUrl: tc.track.fileUrl,
        format: tc.track.format,
        durationSeconds: tc.track.durationSeconds,
        position: tc.track.position,
      });
    }

    return {
      slug: collaborator.slug,
      name: collaborator.name,
      role: collaborator.role,
      bio: collaborator.bio,
      pictureUrl: collaborator.pictureUrl,
      links: collaborator.links,
      linkedUsername: collaborator.linkedUser?.username ?? null,
      gallery: collaborator.galleryImages.map((g) => ({ id: g.id, url: g.url })),
      discography: [...albumMap.values()],
    };
  });

  app.post<{ Body: { name: string; role: string } }>("/api/admin/collaborators", { preHandler: requireAdmin }, async (req, reply) => {
    const { name, role } = req.body ?? {};
    if (!name || !role) return reply.code(400).send({ error: "name and role are required" });
    const slug = await uniqueSlug(name);
    const maxPosition = await prisma.collaborator.aggregate({ _max: { position: true } });
    const collaborator = await prisma.collaborator.create({ data: { name, role, slug, position: (maxPosition._max.position ?? -1) + 1 } });
    return reply.code(201).send(collaborator);
  });

  app.post<{ Body: { orderedIds: number[] } }>("/api/admin/collaborators/reorder", { preHandler: requireAdmin }, async (req, reply) => {
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return reply.code(400).send({ error: "orderedIds must be an array" });
    await Promise.all(orderedIds.map((id, index) => prisma.collaborator.update({ where: { id }, data: { position: index } })));
    return { status: "ok" };
  });

  app.patch<{ Params: { id: string }; Body: Partial<{ name: string; role: string; bio: string; links: { label: string; url: string }[] }> }>(
    "/api/admin/collaborators/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.collaborator.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    },
  );

  app.post<{ Params: { id: string } }>("/api/admin/collaborators/:id/ensure-slug", { preHandler: requireAdmin }, async (req, reply) => {
    const collaborator = await prisma.collaborator.findUnique({ where: { id: Number(req.params.id) } });
    if (!collaborator) return reply.code(404).send({ error: "not found" });
    if (collaborator.slug) return { slug: collaborator.slug };
    const slug = await uniqueSlug(collaborator.name, collaborator.id);
    await prisma.collaborator.update({ where: { id: collaborator.id }, data: { slug } });
    return { slug };
  });

  app.post<{ Params: { id: string } }>("/api/admin/collaborators/:id/picture", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "avatars");
      const collaborator = await prisma.collaborator.update({ where: { id: Number(req.params.id) }, data: { pictureUrl: url } });
      return { pictureUrl: collaborator.pictureUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/admin/collaborators/:id/gallery", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "albums");
      const maxPosition = await prisma.collaboratorGalleryImage.aggregate({
        where: { collaboratorId: Number(req.params.id) },
        _max: { position: true },
      });
      const image = await prisma.collaboratorGalleryImage.create({
        data: { collaboratorId: Number(req.params.id), url, position: (maxPosition._max.position ?? -1) + 1 },
      });
      return reply.code(201).send(image);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string; imageId: string } }>(
    "/api/admin/collaborators/:id/gallery/:imageId",
    { preHandler: requireAdmin },
    async (req) => {
      await prisma.collaboratorGalleryImage.delete({ where: { id: Number(req.params.imageId) } });
      return { status: "ok" };
    },
  );

  app.post<{ Params: { id: string }; Body: { userId: number } }>(
    "/api/admin/collaborators/:id/link-user",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { userId } = req.body ?? {};
      if (!userId) return reply.code(400).send({ error: "userId is required" });
      await prisma.collaborator.update({ where: { id: Number(req.params.id) }, data: { linkedUserId: userId } });
      return { status: "linked" };
    },
  );

  app.post<{ Params: { id: string } }>("/api/admin/collaborators/:id/unlink-user", { preHandler: requireAdmin }, async (req) => {
    await prisma.collaborator.update({ where: { id: Number(req.params.id) }, data: { linkedUserId: null } });
    return { status: "unlinked" };
  });
}
