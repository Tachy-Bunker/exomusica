import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { linksTo, validBacklinkPath } from "../lib/backlinks.js";

interface Hit { type: "study" | "wiki" | "news"; slug: string; title: string; href: string }

/** What links to this page, among studies, wiki pages and news posts. A plain text search, narrowed in JS, capped at 20. */
export async function backlinkRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { path?: string } }>("/api/backlinks", async (req, reply) => {
    const path = req.query.path;
    if (!validBacklinkPath(path)) return reply.code(400).send({ error: "path must be a page address such as /album/some-slug" });
    const [studies, wiki, news] = await Promise.all([
      prisma.study.findMany({ where: { body: { contains: path } }, select: { slug: true, title: true, body: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
      prisma.wikiPage.findMany({ where: { contentMarkdown: { contains: path } }, select: { slug: true, title: true, contentMarkdown: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
      prisma.blogPost.findMany({ where: { contentMarkdown: { contains: path } }, select: { slug: true, title: true, contentMarkdown: true }, take: 30 }),
    ]);
    const hits: Hit[] = [
      ...studies.filter((s: { body: string }) => linksTo(s.body, path)).map((s: { slug: string; title: string }) => ({ type: "study" as const, slug: s.slug, title: s.title, href: `/study/${s.slug}` })),
      ...wiki.filter((w: { contentMarkdown: string }) => linksTo(w.contentMarkdown, path)).map((w: { slug: string; title: string }) => ({ type: "wiki" as const, slug: w.slug, title: w.title, href: `/wiki/${w.slug}` })),
      ...news.filter((n: { contentMarkdown: string }) => linksTo(n.contentMarkdown, path)).map((n: { slug: string; title: string }) => ({ type: "news" as const, slug: n.slug, title: n.title, href: `/news/${n.slug}` })),
    ].filter((h) => h.href !== path).slice(0, 20); // a page does not back-link itself
    reply.header("Cache-Control", "public, max-age=60");
    return hits;
  });
}
