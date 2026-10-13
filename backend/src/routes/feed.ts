import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { absolute, newestFirst, plainSummary, toAtom, toJsonFeed, type Feed, type FeedItem } from "../lib/feed.js";

const baseOf = (req: FastifyRequest): string => process.env.PUBLIC_URL?.replace(/\/$/, "") || `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  function send(req: FastifyRequest<{ Querystring: { format?: string } }>, reply: import("fastify").FastifyReply, feed: Feed) {
    reply.header("Cache-Control", "public, max-age=300");
    if (req.query.format === "json") { reply.header("Content-Type", "application/feed+json; charset=utf-8"); return toJsonFeed(feed); }
    reply.header("Content-Type", "application/atom+xml; charset=utf-8");
    return toAtom(feed);
  }

  // What is new in a branch: its albums, approved community pieces and the studies about it. Hidden branches don't exist here.
  app.get<{ Params: { slug: string }; Querystring: { format?: string } }>("/api/feed/branch/:slug", async (req, reply) => {
    const base = baseOf(req);
    const b = await prisma.branch.findUnique({
      where: { slug: req.params.slug },
      select: {
        name: true, slug: true, description: true, visibility: true,
        albums: { orderBy: { createdAt: "desc" }, take: 30, select: { slug: true, title: true, composer: true, description: true, coverArtUrl: true, createdAt: true } },
        submissions: { where: { submissionStatus: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 30, select: { slug: true, title: true, composer: true, description: true, coverArtUrl: true, createdAt: true } },
        studies: { orderBy: { updatedAt: "desc" }, take: 30, select: { slug: true, title: true, body: true, updatedAt: true, owner: { select: { username: true } } } },
      },
    });
    if (!b || b.visibility === "HIDDEN") return reply.code(404).send({ error: "no such branch" });
    const items: FeedItem[] = [
      ...b.albums.map((a) => ({ id: `${base}/album/${a.slug}`, title: `${a.title} — ${a.composer}`, url: `${base}/album/${a.slug}`, summary: plainSummary(a.description), date: a.createdAt, image: absolute(base, a.coverArtUrl) })),
      ...b.submissions.map((a) => ({ id: `${base}/community-album/${a.slug}`, title: `${a.title} — ${a.composer}`, url: `${base}/community-album/${a.slug}`, summary: plainSummary(a.description), date: a.createdAt, image: absolute(base, a.coverArtUrl) })),
      ...b.studies.map((s) => ({ id: `${base}/study/${s.slug}`, title: `Study: ${s.title}`, url: `${base}/study/${s.slug}`, summary: plainSummary(s.body), date: s.updatedAt, author: s.owner.username })),
    ];
    return send(req, reply, { title: `${b.name} · Exomusica`, subtitle: b.description ?? undefined, url: `${base}/branch/${b.slug}`, selfUrl: `${base}/api/feed/branch/${b.slug}`, items: newestFirst(items) });
  });

  // One study's life: the study itself, then every saved draft.
  app.get<{ Params: { slug: string }; Querystring: { format?: string } }>("/api/feed/study/:slug", async (req, reply) => {
    const base = baseOf(req);
    const s = await prisma.study.findUnique({
      where: { slug: req.params.slug },
      select: { slug: true, title: true, body: true, status: true, updatedAt: true, owner: { select: { username: true } }, revisions: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, label: true, createdAt: true, author: { select: { username: true } } } } },
    });
    if (!s) return reply.code(404).send({ error: "no such study" });
    const url = `${base}/study/${s.slug}`;
    const items: FeedItem[] = [
      { id: `${url}#now`, title: `${s.title}${s.status === "COMPLETE" ? " (complete)" : ""}`, url, summary: plainSummary(s.body), date: s.updatedAt, author: s.owner.username },
      ...s.revisions.map((r) => ({ id: `${url}#rev-${r.id}`, title: r.label ? `${r.label}: ${r.title}` : `Draft saved: ${r.title}`, url, date: r.createdAt, author: r.author?.username })),
    ];
    return send(req, reply, { title: `${s.title} · Exomusica study`, url, selfUrl: `${base}/api/feed/study/${s.slug}`, items: newestFirst(items) });
  });
}
