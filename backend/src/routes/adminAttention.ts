import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { buildAttention } from "../lib/attention.js";

// Panels whose light means "new since you last opened it". Opening the panel clears it.
const NEW_PANELS = new Set(["studies", "channels", "trash"]);

const CAP = 500;
// The "incomplete things" part is the same for every admin and changes slowly, so it is looked up with the gaps filtered in the
// database (not by loading whole tables) and reused for a minute.
let cache: { at: number; value: Awaited<ReturnType<typeof loadIncomplete>> } | null = null;
async function incomplete() {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = await loadIncomplete();
  cache = { at: Date.now(), value };
  return value;
}
async function loadIncomplete() {
  const [branches, albums, tracks, collabs, aboutN, settings] = await Promise.all([
    prisma.branch.findMany({ where: { visibility: "VISIBLE", hidden: false, OR: [{ description: null }, { description: "" }, { coverArtUrl: null }, { coverArtUrl: "" }] }, take: CAP, select: { name: true, description: true, coverArtUrl: true } }),
    prisma.album.findMany({ where: { OR: [{ coverArtUrl: null }, { coverArtUrl: "" }, { description: null }, { description: "" }, { composer: "" }, { tracks: { none: {} } }] }, take: CAP, select: { slug: true, title: true, coverArtUrl: true, description: true, composer: true, _count: { select: { tracks: true } } } }),
    prisma.track.findMany({ where: { OR: [{ genres: { isEmpty: true } }, { durationSeconds: null }, { durationSeconds: 0 }] }, take: CAP, select: { id: true, title: true, genres: true, durationSeconds: true, album: { select: { title: true } } } }),
    prisma.collaborator.findMany({ where: { OR: [{ bio: null }, { bio: "" }, { pictureUrl: null }, { pictureUrl: "" }] }, take: CAP, select: { name: true, bio: true, pictureUrl: true } }),
    prisma.aboutFeature.count(),
    prisma.siteSettings.findUnique({ where: { id: 1 }, select: { faviconUrl: true } }),
  ]);
  return { branches, albums, tracks, collabs, aboutN, settings };
}

export async function adminAttentionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/attention", { preHandler: requireAdmin }, async (req) => {
    const me = req.user!.id;
    const seenRows = await prisma.adminPanelSeen.findMany({ where: { userId: me } });
    const seen = new Map(seenRows.map((r) => [r.panel, r.seenAt]));
    // The first time a panel is ever looked at there is no baseline: start from now, so a long history doesn't light up on day one.
    const missing = [...NEW_PANELS].filter((p) => !seen.has(p));
    if (missing.length) {
      await prisma.adminPanelSeen.createMany({ data: missing.map((panel) => ({ userId: me, panel })), skipDuplicates: true });
      for (const p of missing) seen.set(p, new Date());
    }
    const since = (p: string) => seen.get(p) ?? new Date();

    const [joins, joinTotal, subs, subTotal, claims, claimTotal, studies, questions, trashed, inc] = await Promise.all([
      prisma.joinRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, username: true } }),
      prisma.joinRequest.count({ where: { status: "PENDING" } }),
      prisma.communityAlbum.findMany({ where: { submissionStatus: "PENDING", tracks: { some: {} } }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, title: true } }),
      prisma.communityAlbum.count({ where: { submissionStatus: "PENDING", tracks: { some: {} } } }),
      prisma.rewardClaim.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 40, select: { id: true, reward: { select: { title: true } } } }),
      prisma.rewardClaim.count({ where: { status: "pending" } }),
      prisma.study.findMany({ where: { createdAt: { gt: since("studies") }, ownerId: { not: me } }, orderBy: { createdAt: "desc" }, take: 40, select: { slug: true, title: true, owner: { select: { username: true } } } }),
      prisma.forumChannel.findMany({ where: { isUserQuestion: true, createdAt: { gt: since("channels") } }, orderBy: { createdAt: "desc" }, take: 40, select: { slug: true, name: true } }),
      prisma.message.count({ where: { isDeleted: true, deletedAt: { gt: since("trash") } } }),
      incomplete(),
    ]);
    const { branches, albums, tracks, collabs, aboutN, settings } = inc;

    return buildAttention({
      joinRequests: joins, joinTotal,
      submissions: subs, submissionTotal: subTotal,
      rewardClaims: claims.map((c) => ({ id: c.id, title: c.reward.title })), rewardTotal: claimTotal,
      newStudies: studies.map((s) => ({ slug: s.slug, title: s.title, owner: s.owner.username })),
      newQuestions: questions,
      newTrashed: trashed,
      branches,
      albums: albums.map((a) => ({ slug: a.slug, title: a.title, coverArtUrl: a.coverArtUrl, description: a.description, composer: a.composer, trackCount: a._count.tracks })),
      tracks: tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: t.album.title, genres: t.genres, durationSeconds: t.durationSeconds })),
      collaborators: collabs,
      aboutFeatureCount: aboutN,
      faviconUrl: settings?.faviconUrl ?? null,
    });
  });

  // "I've looked": clears a "new since" light.
  app.post<{ Body: { panel?: string } }>("/api/admin/attention/seen", { preHandler: requireAdmin }, async (req, reply) => {
    const panel = req.body?.panel;
    if (typeof panel !== "string" || !NEW_PANELS.has(panel)) return reply.code(400).send({ error: "that panel has no new-since light" });
    await prisma.adminPanelSeen.upsert({ where: { userId_panel: { userId: req.user!.id, panel } }, create: { userId: req.user!.id, panel }, update: { seenAt: new Date() } });
    return { ok: true };
  });
}
