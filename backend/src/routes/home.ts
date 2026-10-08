import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { PUBLIC_CHANNEL_FILTER, isPublicChannel, plainExcerpt, attachmentOnlyLabel } from "../lib/publicChannels.js";
import { mergeActivity, onePerChannel, studyLabel, lastActiveAt, type ActivityItem } from "../lib/homeFeed.js";

const CACHE_MS = 30_000;
const NOT_HIDDEN = { visibility: { not: "HIDDEN" as const } };

async function buildHome() {
  const [branchRows, recentMessages, albums, studies, post, challenge, newMembers, members, tracks, studyCount, albumTracks] = await Promise.all([
    prisma.branch.findMany({
      where: NOT_HIDDEN,
      select: {
        id: true, slug: true, name: true, description: true, longDescription: true, coverArtUrl: true, posX: true, posY: true, visibility: true, isAnchor: true,
        identityColor: true, identityGlyph: true, identityImageUrl: true, identitySecondaryImageUrl: true, identityBgOpacity: true,
        parent: { select: { slug: true } },
        channel: { select: { id: true, slug: true } },
        albums: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { albums: true } },
        studies: { select: { slug: true, title: true, status: true }, orderBy: { updatedAt: "desc" }, take: 4 },
      },
    }),
    prisma.message.findMany({
      where: { isDeleted: false, channel: PUBLIC_CHANNEL_FILTER },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        contentRaw: true, createdAt: true,
        author: { select: { username: true } },
        channel: { select: { slug: true, name: true, branchId: true, branch: { select: { visibility: true, slug: true } } } },
        attachments: { select: { filename: true }, take: 3 },
      },
    }),
    prisma.album.findMany({
      where: { branch: NOT_HIDDEN },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { slug: true, title: true, createdAt: true, branch: { select: { name: true } }, _count: { select: { tracks: true } } },
    }),
    prisma.study.findMany({ orderBy: { updatedAt: "desc" }, take: 3, select: { slug: true, title: true, createdAt: true, updatedAt: true, owner: { select: { username: true } } } }),
    prisma.blogPost.findFirst({ where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true, publishedAt: true } }),
    prisma.challenge.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" }, select: { title: true, createdAt: true, _count: { select: { submissions: true } } } }),
    prisma.user.findMany({ where: { isGhost: false, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { username: true, bio: true, createdAt: true } }),
    prisma.user.count({ where: { isGhost: false, deletedAt: null } }),
    prisma.track.count({ where: { album: { branch: NOT_HIDDEN } } }),
    prisma.study.count(),
    prisma.album.findMany({ where: { branch: NOT_HIDDEN }, select: { branchId: true, _count: { select: { tracks: true } } } }),
  ]);

  // When each branch's chat last had a message (one query for all of them).
  const chatIds = branchRows.map((b) => b.channel?.id).filter((id): id is number => typeof id === "number");
  const lastMessages = chatIds.length
    ? await prisma.message.groupBy({ by: ["channelId"], where: { isDeleted: false, channelId: { in: chatIds } }, _max: { createdAt: true } })
    : [];
  const lastMessageByChannel = new Map(lastMessages.map((m) => [m.channelId, m._max.createdAt]));

  const tracksByBranch = new Map<number, number>();
  for (const a of albumTracks) tracksByBranch.set(a.branchId, (tracksByBranch.get(a.branchId) ?? 0) + a._count.tracks);
  const branches = branchRows.map((b) => ({
    slug: b.slug,
    name: b.name,
    blurb: plainExcerpt(b.description ?? "", 150),
    coverArtUrl: b.coverArtUrl,
    posX: b.posX,
    posY: b.posY,
    parentSlug: b.parent?.slug ?? null,
    seed: b.visibility === "BABY_CRYSTALS",
    anchor: b.isAnchor,
    color: b.identityColor,
    glyph: b.identityGlyph,
    details: b.longDescription?.trim() || null,
    image: b.identityImageUrl,
    secondaryImage: b.identitySecondaryImageUrl,
    bgOpacity: b.identityBgOpacity,
    albums: b._count.albums,
    tracks: tracksByBranch.get(b.id) ?? 0,
    chatSlug: b.channel?.slug ?? null,
    studies: b.studies.map((s) => ({ slug: s.slug, title: s.title, complete: s.status === "COMPLETE" })),
    lastActiveAt: lastActiveAt(b.albums[0]?.createdAt, b.channel ? lastMessageByChannel.get(b.channel.id) : null),
  }));

  const chatItems = onePerChannel(
    recentMessages
      .filter((m) => isPublicChannel(m.channel)) // never rely on the query filter alone
      .map((m) => ({
        channelSlug: m.channel.slug,
        channelName: m.channel.name,
        branchSlug: m.channel.branch?.slug ?? null,
        author: m.author.username,
        text: plainExcerpt(m.contentRaw, 90) || attachmentOnlyLabel(m.attachments.map((a) => a.filename)),
        at: m.createdAt.getTime(),
      }))
      .filter((m) => m.text),
  ).map<ActivityItem>((m) => ({
    kind: "chat",
    label: "Chat",
    title: m.channelName,
    by: m.author,
    text: m.text,
    detail: "",
    href: m.branchSlug ? `/soundbay?open=${m.branchSlug}` : `/topic/${m.channelSlug}`,
    at: m.at,
  }));

  const none = { by: null, text: "" } as const;
  const items: ActivityItem[] = [
    ...chatItems,
    ...albums.map<ActivityItem>((a) => ({ ...none, kind: "album", label: "New album", title: a.title, detail: `${a.branch.name} · ${a._count.tracks} track${a._count.tracks === 1 ? "" : "s"}`, href: `/album/${a.slug}`, at: a.createdAt.getTime() })),
    ...studies.map<ActivityItem>((s) => ({ kind: "study", label: studyLabel(s.createdAt.getTime(), s.updatedAt.getTime()), title: s.title, by: s.owner.username, text: "", detail: "", href: `/study/${s.slug}`, at: s.updatedAt.getTime() })),
    ...(post?.publishedAt ? [{ ...none, kind: "update" as const, label: "Update", title: post.title, detail: "", href: `/news/${post.slug}`, at: post.publishedAt.getTime() }] : []),
    ...(challenge ? [{ ...none, kind: "challenge" as const, label: "Challenge", title: challenge.title, detail: `${challenge._count.submissions} ${challenge._count.submissions === 1 ? "entry" : "entries"}`, href: "/challenges", at: challenge.createdAt.getTime() }] : []),
    ...newMembers.map<ActivityItem>((u) => ({ kind: "member", label: "New member", title: u.username, by: u.username, text: "", detail: plainExcerpt(u.bio ?? "", 60), href: `/u/${encodeURIComponent(u.username)}`, at: u.createdAt.getTime() })),
  ];

  return {
    stats: { members, tracks, studies: studyCount, branches: branches.length },
    branches,
    activity: mergeActivity(items),
    generatedAt: Date.now(),
  };
}

type Home = Awaited<ReturnType<typeof buildHome>>;
let cache: { at: number; data: Home } | null = null;
let inflight: Promise<Home> | null = null;

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  // One request for everything the homepage shows. Public data only, the same for everyone, so it is cached for a short time.
  app.get("/api/home", async (_req, reply) => {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      inflight ??= buildHome().finally(() => { inflight = null; });
      const data = await inflight;
      cache = { at: Date.now(), data };
    }
    reply.header("cache-control", "public, max-age=15");
    return cache.data;
  });
}
