import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { plainExcerpt } from "../lib/publicChannels.js";
import { imagesInMarkdown } from "../lib/resourceAccess.js";
import { ttlCache } from "../lib/ttlCache.js";

type Kind = "study" | "news" | "wiki";
const KINDS: Kind[] = ["study", "news", "wiki"];
const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as string[]).includes(k);

interface Resolved { title: string; href: string; by: string | null; body: string; images: string[]; cover: string | null; updatedAt: Date | null }

/** The article a featured entry points at, or null when it is gone (or, for news, no longer published). */
async function resolve(kind: Kind, slug: string): Promise<Resolved | null> {
  if (kind === "study") {
    const s = await prisma.study.findUnique({ where: { slug }, select: { slug: true, title: true, body: true, backgroundUrl: true, updatedAt: true, owner: { select: { username: true } } } });
    return s && { title: s.title, href: `/study/${s.slug}`, by: s.owner.username, body: s.body, images: imagesInMarkdown(s.body), cover: s.backgroundUrl, updatedAt: s.updatedAt };
  }
  if (kind === "news") {
    const p = await prisma.blogPost.findUnique({ where: { slug }, select: { slug: true, title: true, contentMarkdown: true, coverImageUrl: true, publishedAt: true } });
    return p && p.publishedAt ? { title: p.title, href: `/news/${p.slug}`, by: null, body: p.contentMarkdown, images: imagesInMarkdown(p.contentMarkdown), cover: p.coverImageUrl, updatedAt: p.publishedAt } : null;
  }
  const w = await prisma.wikiPage.findUnique({ where: { slug }, select: { slug: true, title: true, contentMarkdown: true, updatedAt: true } });
  return w && { title: w.title, href: `/wiki/${w.slug}`, by: null, body: w.contentMarkdown, images: imagesInMarkdown(w.contentMarkdown), cover: null, updatedAt: w.updatedAt };
}

const cleanOpacity = (v: unknown): number | null | undefined => (v === undefined ? undefined : v === null ? null : typeof v === "number" && v >= 0.05 && v <= 0.9 ? Math.round(v * 100) / 100 : undefined);
const cleanImage = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === "string" && !v.trim())) return null;
  return typeof v === "string" && v.length <= 1000 && /^(https?:\/\/|\/uploads\/)\S+$/i.test(v.trim()) ? v.trim() : undefined;
};

const publicList = ttlCache(30_000, async () => {
  const rows = await prisma.featuredArticle.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const out = [];
  for (const r of rows) {
    if (!isKind(r.kind)) continue;
    const a = await resolve(r.kind, r.refSlug);
    if (!a) continue;
    out.push({
      id: r.id,
      kind: r.kind,
      title: a.title,
      href: a.href,
      by: a.by,
      text: r.text?.trim() || plainExcerpt(a.body, 220),
      imageUrl: r.imageUrl ?? a.cover ?? a.images[0] ?? null,
      imageOpacity: r.imageOpacity,
      updatedAt: a.updatedAt,
    });
  }
  return out;
});

export async function featuredRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/featured", async () => publicList());

  app.get("/api/admin/featured", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.featuredArticle.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const out = [];
    for (const r of rows) {
      const a = isKind(r.kind) ? await resolve(r.kind, r.refSlug) : null;
      out.push({ ...r, title: a?.title ?? null, missing: !a });
    }
    return out;
  });

  // The pictures an article has (its cover / background and the ones in its text): what the admin chooses a background from.
  app.get<{ Querystring: { kind?: string; slug?: string } }>("/api/admin/featured/article", { preHandler: requireAdmin }, async (req, reply) => {
    const { kind, slug } = req.query;
    if (!isKind(kind) || !slug) return reply.code(400).send({ error: "kind and slug are required" });
    const a = await resolve(kind, slug);
    if (!a) return reply.code(404).send({ error: "no such article (a news post must be published)" });
    const images = [...new Set([...(a.cover ? [a.cover] : []), ...a.images])];
    return { title: a.title, excerpt: plainExcerpt(a.body, 220), images };
  });

  app.post<{ Body: { kind?: string; refSlug?: string; text?: string; imageUrl?: string | null; imageOpacity?: number | null } }>("/api/admin/featured", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    if (!isKind(b.kind) || !b.refSlug) return reply.code(400).send({ error: "choose a study, news post or wiki page" });
    if (!(await resolve(b.kind, b.refSlug))) return reply.code(404).send({ error: "no such article (a news post must be published)" });
    const image = cleanImage(b.imageUrl);
    if (image === undefined && b.imageUrl !== undefined) return reply.code(400).send({ error: "the picture must be a web link (https://...) or one of the site's pictures" });
    const last = await prisma.featuredArticle.aggregate({ _max: { sortOrder: true } });
    try {
      const row = await prisma.featuredArticle.create({ data: { kind: b.kind, refSlug: b.refSlug, text: typeof b.text === "string" && b.text.trim() ? b.text.trim().slice(0, 600) : null, imageUrl: image ?? null, imageOpacity: cleanOpacity(b.imageOpacity) ?? null, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      return reply.code(201).send(row);
    } catch {
      return reply.code(409).send({ error: "That article is already featured." });
    }
  });

  app.patch<{ Params: { id: string }; Body: { text?: string | null; imageUrl?: string | null; imageOpacity?: number | null; active?: boolean } }>("/api/admin/featured/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.text !== undefined) data.text = typeof b.text === "string" && b.text.trim() ? b.text.trim().slice(0, 600) : null;
    if (b.imageUrl !== undefined) { const v = cleanImage(b.imageUrl); if (v === undefined) return reply.code(400).send({ error: "the picture must be a web link (https://...) or one of the site's pictures" }); data.imageUrl = v; }
    if (b.imageOpacity !== undefined) { const v = cleanOpacity(b.imageOpacity); if (v === undefined) return reply.code(400).send({ error: "opacity must be from 0.05 to 0.9" }); data.imageOpacity = v; }
    if (b.active !== undefined) data.active = b.active === true;
    return prisma.featuredArticle.update({ where: { id: Number(req.params.id) }, data });
  });

  app.post<{ Body: { ids?: number[] } }>("/api/admin/featured/reorder", { preHandler: requireAdmin }, async (req, reply) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((n) => Number.isInteger(n)) : [];
    if (ids.length === 0) return reply.code(400).send({ error: "ids are required" });
    await prisma.$transaction(ids.map((id, i) => prisma.featuredArticle.update({ where: { id }, data: { sortOrder: i + 1 } })));
    return { status: "ok" };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/featured/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.featuredArticle.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
