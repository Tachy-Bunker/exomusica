import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { linksTo, secondRing, validBacklinkPath } from "../lib/backlinks.js";
import { getMilestones } from "../lib/milestones.js";

interface Hit { type: "study" | "wiki" | "news"; slug: string; title: string; href: string }

/** What links to this page, among studies, wiki pages and news posts. A plain text search, narrowed in JS, capped at 20. */
async function findBack(path: string): Promise<Hit[]> {
  const [studies, wiki, news] = await Promise.all([
    prisma.study.findMany({ where: { body: { contains: path } }, select: { slug: true, title: true, body: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.wikiPage.findMany({ where: { contentMarkdown: { contains: path } }, select: { slug: true, title: true, contentMarkdown: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.blogPost.findMany({ where: { contentMarkdown: { contains: path } }, select: { slug: true, title: true, contentMarkdown: true }, take: 30 }),
  ]);
  return [
    ...studies.filter((s: { body: string }) => linksTo(s.body, path)).map((s: { slug: string; title: string }) => ({ type: "study" as const, slug: s.slug, title: s.title, href: `/study/${s.slug}` })),
    ...wiki.filter((w: { contentMarkdown: string }) => linksTo(w.contentMarkdown, path)).map((w: { slug: string; title: string }) => ({ type: "wiki" as const, slug: w.slug, title: w.title, href: `/wiki/${w.slug}` })),
    ...news.filter((n: { contentMarkdown: string }) => linksTo(n.contentMarkdown, path)).map((n: { slug: string; title: string }) => ({ type: "news" as const, slug: n.slug, title: n.title, href: `/news/${n.slug}` })),
  ].filter((h) => h.href !== path).slice(0, 20); // a page does not back-link itself
}

// Two-link answers cost up to nine searches, so they are remembered for a minute.
const deep = new Map<string, { at: number; v: { hits: Hit[]; second: ReturnType<typeof secondRing> } }>();
const DEEP_VIA = 8;

/** What links to this page, among studies, wiki pages and news posts. A plain text search, narrowed in JS, capped at 20. With depth=2 (once the X-ray milestone is reached) also the pages that link to those. */
export async function backlinkRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { path?: string; depth?: string } }>("/api/backlinks", async (req, reply) => {
    const path = req.query.path;
    if (!validBacklinkPath(path)) return reply.code(400).send({ error: "path must be a page address such as /album/some-slug" });
    reply.header("Cache-Control", "public, max-age=60");
    if (req.query.depth === "2") {
      if (!(await getMilestones()).find((m) => m.key === "m-xray")?.reached) return { locked: true, hits: await findBack(path), second: [] };
      const hit = deep.get(path);
      if (hit && Date.now() - hit.at < 60_000) return { locked: false, ...hit.v };
      const hits = await findBack(path);
      const via = new Map<string, Hit[]>();
      await Promise.all(hits.slice(0, DEEP_VIA).map(async (h) => { via.set(h.href, await findBack(h.href)); }));
      const v = { hits, second: secondRing(path, hits.slice(0, DEEP_VIA), via) };
      if (deep.size > 200) deep.clear();
      deep.set(path, { at: Date.now(), v });
      return { locked: false, ...v };
    }
    return findBack(path);
  });
}
