import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function forumMapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/forum-map", async () => {
    const nodes = await prisma.forumMapNode.findMany({
      include: {
        channel: { select: { slug: true, name: true, kind: true, branchId: true, contentMarkdown: true } },
        playlist: { select: { slug: true, title: true, owner: { select: { username: true } } } },
        sampleBankItem: { select: { id: true, title: true, owner: { select: { username: true } } } },
        challenge: { select: { id: true, title: true } },
      },
    });

    // Unique speaker count per channel (ghosts included — Message.authorId
    // counts any author regardless of isGhost) — this is what drives the
    // firefly count on each node. One grouped query rather than one per
    // node.
    const speakerCounts = await prisma.$queryRaw<{ channelId: number; count: bigint }[]>`
      SELECT "channelId", COUNT(DISTINCT "authorId") as count
      FROM "Message"
      WHERE "isDeleted" = false
      GROUP BY "channelId"
    `;
    const speakerCountByChannelId = new Map(speakerCounts.map((r) => [r.channelId, Number(r.count)]));

    return nodes.map((n) => ({
      ...n,
      speakerCount: n.channel ? (speakerCountByChannelId.get(n.channelId!) ?? 0) : 0,
    }));
  });

  app.post<{
    Body: {
      type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS" | "PLAYLIST" | "SAMPLE_BANK_ITEM" | "CHALLENGE";
      channelId?: number;
      playlistId?: number;
      sampleBankItemId?: number;
      challengeId?: number;
      parentId?: number | null;
      x: number;
      y: number;
    };
  }>(
    "/api/admin/forum-map/nodes",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { type, channelId, playlistId, sampleBankItemId, challengeId, parentId, x, y } = req.body ?? {};
      const refCount = [channelId, playlistId, sampleBankItemId, challengeId].filter(Boolean).length;
      if (refCount !== 1) return reply.code(400).send({ error: "exactly one of channelId, playlistId, sampleBankItemId, or challengeId is required" });
      const node = await prisma.forumMapNode.create({
        data: {
          type,
          channelId: channelId ?? null,
          playlistId: playlistId ?? null,
          sampleBankItemId: sampleBankItemId ?? null,
          challengeId: challengeId ?? null,
          parentId: parentId ?? null,
          x: x ?? 0,
          y: y ?? 0,
        },
      });
      return reply.code(201).send(node);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ parentId: number | null; x: number; y: number; color: string | null; size: number | null; hidden: boolean }> }>(
    "/api/admin/forum-map/nodes/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.forumMapNode.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/forum-map/nodes/:id", { preHandler: requireAdmin }, async (req) => {
    await prisma.forumMapNode.delete({ where: { id: Number(req.params.id) } });
    return { status: "ok" };
  });
}
