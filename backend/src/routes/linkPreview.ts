import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth.js";
import { safeGet, readBody, checkUrlShape } from "../lib/netGuard.js";

function extractMeta(html: string, property: string): string | null {
  // Handles both attribute orders: property/content and content/property.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function linkPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { url?: string } }>("/api/link-preview", { preHandler: requireAuth }, async (req, reply) => {
    const target = req.query.url;
    if (!target) return reply.code(400).send({ error: "url is required" });

    let parsed: URL;
    try {
      parsed = new URL(target);
      checkUrlShape(parsed);
    } catch {
      return reply.code(400).send({ error: "only public http/https web addresses can be previewed" });
    }

    const fallback = { url: parsed.toString(), title: parsed.hostname, description: null, image: null };
    try {
      // Every address is checked before it is connected to, and each redirect too (see lib/netGuard.ts).
      const { res, url: finalUrl } = await safeGet(parsed, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ExomusicaLinkPreview/1.0)", accept: "text/html,*/*;q=0.5" },
        timeoutMs: 5000,
        maxRedirects: 3,
      });
      const contentType = String(res.headers["content-type"] ?? "");
      if (!contentType.includes("text/html")) {
        res.resume();
        return fallback;
      }
      // Only read the head - og/title tags are always near the top, and this avoids downloading a whole large page.
      const html = (await readBody(res, 65536, 6000)).subarray(0, 65536).toString("utf8");

      const title = extractMeta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? parsed.hostname;
      const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
      let image = extractMeta(html, "og:image");
      if (image && !image.startsWith("http")) {
        image = new URL(image, finalUrl).toString();
      }

      return {
        url: parsed.toString(),
        title: decodeEntities(title).trim().slice(0, 200),
        description: description ? decodeEntities(description).trim().slice(0, 300) : null,
        image,
      };
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "link preview not fetched");
      return fallback;
    }
  });
}
