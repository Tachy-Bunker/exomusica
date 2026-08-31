import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { trackToDTO } from "../lib/embeds.js";

interface CreateBranchBody {
  slug: string;
  name: string;
  description?: string;
  coverArtUrl?: string;
  parentId?: number;
  posX?: number;
  posY?: number;
}

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/branches", async () => {
    return prisma.branch.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        coverArtUrl: true,
        parentId: true,
        posX: true,
        posY: true,
        channel: { select: { slug: true } },
      },
      orderBy: { id: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/branches/:slug", async (req, reply) => {
    const branch = await prisma.branch.findUnique({
      where: { slug: req.params.slug },
      include: { channel: { select: { slug: true } } },
    });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    return branch;
  });

  // Read-only summary for the homepage tree's music-preview hover card.
  // Full album CRUD (create/edit, collaborator cards, stream/download
  // links) is Phase 3 — this just makes existing Album/Track rows visible.
  app.get<{ Params: { slug: string } }>("/api/branches/:slug/albums", async (req, reply) => {
    const branch = await prisma.branch.findUnique({ where: { slug: req.params.slug } });
    if (!branch) return reply.code(404).send({ error: "no such branch" });

    const albums = await prisma.album.findMany({
      where: { branchId: branch.id },
      include: {
        tracks: {
          include: { album: { include: { branch: true } }, bookmarks: true },
          orderBy: { position: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return albums.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      composer: a.composer,
      coverArtUrl: a.coverArtUrl,
      previewTrack: a.tracks[0] ? trackToDTO(a.tracks[0]) : null,
    }));
  });

  // Creating a branch also creates its one ForumChannel in the same
  // transaction — the spec ties every branch to exactly one forum topic,
  // so there's no world where you'd want one without the other.
  app.post<{ Body: CreateBranchBody }>(
    "/api/admin/branches",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { slug, name, description, coverArtUrl, parentId, posX, posY } = req.body ?? {};
      if (!slug || !name) {
        return reply.code(400).send({ error: "slug and name are required" });
      }
      const branch = await prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: { slug, name, description, coverArtUrl, parentId, posX, posY },
        });
        await tx.forumChannel.create({
          data: { slug: `branch-${slug}`, name, kind: "BRANCH", branchId: created.id },
        });
        await tx.auditLog.create({
          data: { actorId: req.user!.id, action: "branch.create", targetType: "Branch", targetId: created.id },
        });
        return created;
      });
      return reply.code(201).send(branch);
    },
  );
}
