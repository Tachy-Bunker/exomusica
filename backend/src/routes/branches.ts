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
    const branches = await prisma.branch.findMany({
      where: { visibility: { not: "HIDDEN" } },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        coverArtUrl: true,
        visibility: true,
        crystalCount: true,
        parentId: true,
        isAnchor: true,
        posX: true,
        posY: true,
        channel: { select: { id: true, slug: true } },
      },
      orderBy: { id: "asc" },
    });

    const channelIds = branches.map((b) => b.channel?.id).filter((id): id is number => id != null);
    const lastActivity = await prisma.message.groupBy({
      by: ["channelId"],
      where: { channelId: { in: channelIds }, isDeleted: false },
      _max: { createdAt: true },
    });
    const lastActivityByChannel = new Map<number, Date | null>(lastActivity.map((l) => [l.channelId, l._max.createdAt]));

    return branches.map((b) => ({
      ...b,
      channel: b.channel ? { slug: b.channel.slug } : null,
      lastActivityAt: b.channel ? (lastActivityByChannel.get(b.channel.id)?.toISOString() ?? null) : null,
    }));
  });

  // On-demand SVG snapshot of the main branch tree, for lightweight
  // previews (e.g. on the Listen page) that shouldn't need a live,
  // fully-interactive embed just to look representative. Generated
  // fresh per request rather than cached - branch positions change
  // rarely and the generation itself is cheap.
  app.get("/api/branches/preview.svg", async (_req, reply) => {
    const branches = await prisma.branch.findMany({
      where: { visibility: "VISIBLE" },
      select: { id: true, name: true, posX: true, posY: true, crystalCount: true },
    });
    const points = branches.filter((b) => b.posX !== null && b.posY !== null).map((b) => ({ x: b.posX!, y: b.posY!, crystalCount: b.crystalCount }));
    const maxR = points.length > 0 ? Math.max(...points.map((p) => Math.hypot(p.x, p.y))) : 0;
    const nodeRadius = 22;
    const pad = nodeRadius + 24;
    const half = maxR + pad;
    const size = Math.max(200, half * 2);

    function hashOf(s: string): number {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h;
    }
    const circles = branches
      .filter((b) => b.posX !== null && b.posY !== null)
      .map((b) => {
        const r = nodeRadius * (0.7 + Math.min(0.5, Math.sqrt(Math.max(1, b.crystalCount)) * 0.1));
        const hue = hashOf(b.name) % 360;
        return `<circle cx="${b.posX!.toFixed(1)}" cy="${b.posY!.toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hue}, 45%, 45%)" stroke="hsl(${hue}, 60%, 65%)" stroke-width="1.5" opacity="0.92" />`;
      })
      .join("\n    ");

    const svg = `<svg viewBox="${-half} ${-half} ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="#151022" />
      <stop offset="100%" stop-color="#070510" />
    </radialGradient>
  </defs>
  <rect x="${-half}" y="${-half}" width="${size}" height="${size}" fill="url(#bg)" />
  ${circles}
</svg>`;
    reply.header("Content-Type", "image/svg+xml");
    reply.header("Cache-Control", "public, max-age=300");
    return svg;
  });

  // Admin sees everything, hidden included - needed to ever unhide something.
  app.get("/api/admin/branches", { preHandler: requireAdmin }, async () => {
    return prisma.branch.findMany({
      include: { channel: { select: { id: true, slug: true, discordChannelId: true, discordWebhookUrl: true } } },
      orderBy: { id: "asc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/branches/:slug", async (req, reply) => {
    const branch = await prisma.branch.findUnique({
      where: { slug: req.params.slug },
      include: { channel: { select: { slug: true } }, font: true, guideAsset: true },
    });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    return branch;
  });

  // Read-only summary for the homepage tree's music-preview hover card.
  // Full album CRUD (create/edit, collaborator cards, stream/download
  // links) is Phase 3 - this just makes existing Album/Track rows visible.
  app.get<{ Params: { slug: string } }>("/api/branches/:slug/albums", async (req, reply) => {
    const branch = await prisma.branch.findUnique({ where: { slug: req.params.slug } });
    if (!branch) return reply.code(404).send({ error: "no such branch" });

    const albums = await prisma.album.findMany({
      where: { branchId: branch.id },
      include: {
        tracks: {
          include: { album: { include: { branch: true } }, bookmarks: true, collaborators: { include: { collaborator: true } } },
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
  // transaction - the spec ties every branch to exactly one forum topic,
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

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      description: string;
      coverArtUrl: string;
      hidden: boolean;
      visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS";
      crystalCount: number;
      posX: number;
      posY: number;
      fontId: number | null;
      parentId: number | null;
      isAnchor: boolean;
      guideAssetId: number | null;
      voiceoverText: string;
      ogTitle: string | null;
      ogDescription: string | null;
      ogImageUrl: string | null;
      briefMarkdown: string | null;
      previewAttachmentId: number | null;
      contributeBackgroundUrl: string | null;
      contributeBackgroundOpacity: number;
    }>;
  }>("/api/admin/branches/:id", { preHandler: requireAdmin }, async (req) => {
    const branch = await prisma.branch.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "branch.update", targetType: "Branch", targetId: branch.id, meta: req.body },
    });
    return branch;
  });

  // Cascades to its ForumChannel, every message in it (and their
  // reactions/bookmarks/attachment rows), every album (tracks, links,
  // gallery, collaborator links), and channel-follows - all handled at the
  // database level via onDelete: Cascade, not hand-rolled deletion order
  // here. Uploaded files on disk are not cleaned up by this - the DB rows
  // referencing them are gone, but the files themselves stay in uploads/
  // until removed manually. Irreversible; "hidden" is the reversible option.
  app.delete<{ Params: { id: string } }>("/api/admin/branches/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    await prisma.branch.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "branch.delete", targetType: "Branch", targetId: id, meta: { slug: branch.slug } },
    });
    return reply.code(204).send();
  });
}
