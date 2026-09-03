import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderEmbedHtml(opts: { title: string; description: string; imageUrl: string | null; faviconUrl: string | null; url: string }): string {
  const { title, description, imageUrl, faviconUrl, url } = opts;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${faviconUrl ? `<link rel="icon" href="${escapeHtml(faviconUrl)}">` : ""}
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ""}
<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ""}
</head>
<body>${escapeHtml(title)}</body>
</html>`;
}

export async function embedRoutes(app: FastifyInstance): Promise<void> {
  const baseUrl = "https://exomusica.com";

  app.get("/embed", async (_req, reply) => {
    const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    reply.type("text/html").send(
      renderEmbedHtml({
        title: s?.ogHomepageTitle ?? "Exomusica",
        description: s?.ogHomepageDescription ?? "Accessible experimental music — alien sonic worlds.",
        imageUrl: s?.ogHomepageImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: baseUrl,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/branch/:slug", async (req, reply) => {
    const [branch, s] = await Promise.all([
      prisma.branch.findUnique({ where: { slug: req.params.slug } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!branch) return reply.code(404).send("Not found");
    reply.type("text/html").send(
      renderEmbedHtml({
        title: branch.ogTitle ?? s?.ogBranchDefaultTitle ?? branch.name,
        description: branch.ogDescription ?? s?.ogBranchDefaultDescription ?? branch.description ?? "A branch on Exomusica.",
        imageUrl: branch.ogImageUrl ?? s?.ogBranchDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/branch/${branch.slug}`,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/album/:slug", async (req, reply) => {
    const [album, s] = await Promise.all([
      prisma.album.findUnique({ where: { slug: req.params.slug } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!album) return reply.code(404).send("Not found");
    reply.type("text/html").send(
      renderEmbedHtml({
        title: album.ogTitle ?? s?.ogAlbumDefaultTitle ?? album.title,
        description: album.ogDescription ?? s?.ogAlbumDefaultDescription ?? "An album on Exomusica.",
        imageUrl: album.ogImageUrl ?? s?.ogAlbumDefaultImageUrl ?? album.coverArtUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/album/${album.slug}`,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/wiki/:slug", async (req, reply) => {
    const [page, s] = await Promise.all([
      prisma.wikiPage.findUnique({ where: { slug: req.params.slug } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!page) return reply.code(404).send("Not found");
    reply.type("text/html").send(
      renderEmbedHtml({
        title: page.ogTitle ?? s?.ogWikiDefaultTitle ?? page.title,
        description: page.ogDescription ?? s?.ogWikiDefaultDescription ?? "A wiki page on Exomusica.",
        imageUrl: page.ogImageUrl ?? s?.ogWikiDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/wiki/${page.slug}`,
      }),
    );
  });

  app.get("/embed/news", async (_req, reply) => {
    const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    reply.type("text/html").send(
      renderEmbedHtml({
        title: s?.ogNewsDefaultTitle ?? "Exomusica News",
        description: s?.ogNewsDefaultDescription ?? "Latest news from Exomusica.",
        imageUrl: s?.ogNewsDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/news`,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/blog/:slug", async (req, reply) => {
    const [post, s] = await Promise.all([
      prisma.blogPost.findUnique({ where: { slug: req.params.slug } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!post) return reply.code(404).send("Not found");
    reply.type("text/html").send(
      renderEmbedHtml({
        title: post.ogTitle ?? s?.ogNewsDefaultTitle ?? post.title,
        description: post.ogDescription ?? s?.ogNewsDefaultDescription ?? "A news post on Exomusica.",
        imageUrl: post.ogImageUrl ?? s?.ogNewsDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/news/${post.slug}`,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/topic/:slug", async (req, reply) => {
    const [channel, s] = await Promise.all([
      prisma.forumChannel.findUnique({ where: { slug: req.params.slug } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!channel) return reply.code(404).send("Not found");
    reply.type("text/html").send(
      renderEmbedHtml({
        title: channel.ogTitle ?? s?.ogForumDefaultTitle ?? channel.name,
        description: channel.ogDescription ?? s?.ogForumDefaultDescription ?? channel.description ?? "A forum topic on Exomusica.",
        imageUrl: channel.ogImageUrl ?? s?.ogForumDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/topic/${channel.slug}`,
      }),
    );
  });

  app.get("/embed/forums", async (_req, reply) => {
    const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    reply.type("text/html").send(
      renderEmbedHtml({
        title: s?.ogForumDefaultTitle ?? "Exomusica Forums",
        description: s?.ogForumDefaultDescription ?? "Discussion topics on Exomusica.",
        imageUrl: s?.ogForumDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/forums`,
      }),
    );
  });
}
