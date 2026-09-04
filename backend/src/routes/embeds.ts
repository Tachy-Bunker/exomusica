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

function substitute(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?::(\d+))?\}/g, (match, key: string, charCount?: string) => {
    const value = data[key];
    if (value === undefined) return match;
    const str = String(value);
    return charCount ? str.slice(0, Number(charCount)) : str;
  });
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "") // images
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links -> just the text
    .replace(/[#*_`>~-]/g, "") // common markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
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
    const data = { title: branch.name, description: branch.description ?? "" };
    const titleTemplate = branch.ogTitle ?? s?.ogBranchDefaultTitle ?? "{title}";
    const descTemplate = branch.ogDescription ?? s?.ogBranchDefaultDescription ?? "{description}";
    reply.type("text/html").send(
      renderEmbedHtml({
        title: substitute(titleTemplate, data) || branch.name,
        description: substitute(descTemplate, data) || "A branch on Exomusica.",
        imageUrl: branch.ogImageUrl ?? s?.ogBranchDefaultImageUrl ?? null,
        faviconUrl: s?.faviconUrl ?? null,
        url: `${baseUrl}/branch/${branch.slug}`,
      }),
    );
  });

  app.get<{ Params: { slug: string } }>("/embed/album/:slug", async (req, reply) => {
    const [album, s] = await Promise.all([
      prisma.album.findUnique({
        where: { slug: req.params.slug },
        include: {
          tracks: { include: { collaborators: { include: { collaborator: { select: { name: true } } } } } },
          collaborators: { include: { collaborator: { select: { name: true } } } },
        },
      }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!album) return reply.code(404).send("Not found");
    const composerNames =
      album.collaborators.map((c) => c.collaborator.name).join(", ") ||
      [...new Set(album.tracks.flatMap((t) => t.collaborators.map((c) => c.collaborator.name)))].join(", ") ||
      "Unknown";
    const data = { title: album.title, trackCount: album.tracks.length, composer: composerNames };
    const titleTemplate = album.ogTitle ?? s?.ogAlbumDefaultTitle ?? "{title}";
    const descTemplate = album.ogDescription ?? s?.ogAlbumDefaultDescription ?? "{trackCount} tracks by {composer}";
    reply.type("text/html").send(
      renderEmbedHtml({
        title: substitute(titleTemplate, data) || album.title,
        description: substitute(descTemplate, data) || "An album on Exomusica.",
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
    const data = { title: page.title, content: stripMarkdown(page.contentMarkdown) };
    const titleTemplate = page.ogTitle ?? s?.ogWikiDefaultTitle ?? "{title}";
    const descTemplate = page.ogDescription ?? s?.ogWikiDefaultDescription ?? "{content:160}";
    reply.type("text/html").send(
      renderEmbedHtml({
        title: substitute(titleTemplate, data) || page.title,
        description: substitute(descTemplate, data) || "A wiki page on Exomusica.",
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
    const data = { title: post.title, content: stripMarkdown(post.contentMarkdown) };
    const titleTemplate = post.ogTitle ?? s?.ogNewsDefaultTitle ?? "{title}";
    const descTemplate = post.ogDescription ?? s?.ogNewsDefaultDescription ?? "{content:160}";
    reply.type("text/html").send(
      renderEmbedHtml({
        title: substitute(titleTemplate, data) || post.title,
        description: substitute(descTemplate, data) || "A news post on Exomusica.",
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
    const data = { title: channel.name, description: channel.description ?? "" };
    const titleTemplate = channel.ogTitle ?? s?.ogForumDefaultTitle ?? "{title}";
    const descTemplate = channel.ogDescription ?? s?.ogForumDefaultDescription ?? "{description}";
    reply.type("text/html").send(
      renderEmbedHtml({
        title: substitute(titleTemplate, data) || channel.name,
        description: substitute(descTemplate, data) || "A forum topic on Exomusica.",
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
