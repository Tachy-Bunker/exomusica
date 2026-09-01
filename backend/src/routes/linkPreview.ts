import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth.js";

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
    } catch {
      return reply.code(400).send({ error: "invalid url" });
    }
    // Only ever fetch plain web pages — never let this become a way to
    // reach internal services or other schemes via a pasted chat link.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return reply.code(400).send({ error: "only http/https URLs are supported" });
    }

    try {
      const res = await fetch(parsed.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ExomusicaLinkPreview/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        return { url: parsed.toString(), title: parsed.hostname, description: null, image: null };
      }
      // Only read the head — og/title tags are always near the top, and
      // this avoids downloading an entire large page just for metadata.
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        const decoder = new TextDecoder();
        while (html.length < 65536) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
      }

      const title = extractMeta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? parsed.hostname;
      const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
      let image = extractMeta(html, "og:image");
      if (image && !image.startsWith("http")) {
        image = new URL(image, parsed.toString()).toString();
      }

      return {
        url: parsed.toString(),
        title: decodeEntities(title).trim().slice(0, 200),
        description: description ? decodeEntities(description).trim().slice(0, 300) : null,
        image,
      };
    } catch (err) {
      req.log.warn(err, "link preview fetch failed");
      return { url: parsed.toString(), title: parsed.hostname, description: null, image: null };
    }
  });
}
