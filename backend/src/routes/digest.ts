import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { digestSince, snippet } from "../lib/digest.js";

const hrefOf = (c: { kind: string; slug: string; branch: { slug: string } | null }, id: number) => `${c.kind === "BRANCH" && c.branch ? `/branch/${c.branch.slug}` : `/topic/${c.slug}`}#m-${id}`;

/** "While you were away": what happened since the member was last here, from what they follow and what they own. One request, small queries. */
export async function digestRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { since?: string } }>("/api/digest", { preHandler: requireAuth }, async (req) => {
    const me = req.user!.id;
    const since = digestSince(req.query.since);
    const follows = await prisma.channelFollow.findMany({ where: { userId: me }, select: { channelId: true } });
    const followed = follows.map((f) => f.channelId);
    const chan = { select: { kind: true, slug: true, name: true, branch: { select: { slug: true } } } } as const;
    const [replyCount, replies, albums, studies, topics] = await Promise.all([
      prisma.message.count({ where: { createdAt: { gt: since }, isDeleted: false, authorId: { not: me }, replyTo: { authorId: me } } }),
      prisma.message.findMany({ where: { createdAt: { gt: since }, isDeleted: false, authorId: { not: me }, replyTo: { authorId: me } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, contentRaw: true, author: { select: { username: true } }, channel: chan } }),
      prisma.album.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, take: 4, select: { slug: true, title: true, branch: { select: { name: true } } } }),
      prisma.study.findMany({ where: { updatedAt: { gt: since }, OR: [{ ownerId: me }, ...(followed.length ? [{ channelId: { in: followed } }] : [])] }, orderBy: { updatedAt: "desc" }, take: 4, select: { slug: true, title: true, owner: { select: { username: true } } } }),
      followed.length
        ? prisma.message.groupBy({ by: ["channelId"], where: { channelId: { in: followed }, createdAt: { gt: since }, isDeleted: false, authorId: { not: me } }, _count: { _all: true }, orderBy: { _count: { channelId: "desc" } }, take: 4 })
        : Promise.resolve([] as { channelId: number; _count: { _all: number } }[]),
    ]);
    const names = topics.length ? await prisma.forumChannel.findMany({ where: { id: { in: topics.map((t) => t.channelId) } }, select: { id: true, kind: true, slug: true, name: true, branch: { select: { slug: true } } } }) : [];
    return {
      since: since.getTime(),
      replies: { count: replyCount, items: replies.map((m) => ({ by: m.author.username, text: snippet(m.contentRaw), href: hrefOf(m.channel, m.id), where: m.channel.name })) },
      albums: albums.map((a) => ({ slug: a.slug, title: a.title, branch: a.branch.name })),
      studies: studies.map((s) => ({ slug: s.slug, title: s.title, owner: s.owner.username })),
      topics: topics.map((t) => { const c = names.find((n) => n.id === t.channelId); return c ? { name: c.name, count: t._count._all, href: c.kind === "BRANCH" && c.branch ? `/branch/${c.branch.slug}` : `/topic/${c.slug}` } : null; }).filter(Boolean),
    };
  });
}
