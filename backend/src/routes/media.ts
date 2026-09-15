import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { saveMediaFile } from "../lib/storage.js";
import { prisma } from "../lib/prisma.js";

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/admin/media", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url, mimeType } = await saveMediaFile(file.filename, file.mimetype, buffer);
      return { url, mimeType, filename: file.filename };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.get<{ Params: { kind: string; id: string } }>("/api/audio-proxy/:kind/:id", async (req, reply) => {
    const { kind, id } = req.params;
    let externalUrl: string | null = null;

    if (kind === "track") {
      const track = await prisma.track.findUnique({ where: { id: Number(id) }, select: { fileUrl: true } });
      externalUrl = track?.fileUrl ?? null;
    } else if (kind === "community-track") {
      const track = await prisma.communityTrack.findUnique({ where: { id: Number(id) }, select: { externalUrl: true } });
      externalUrl = track?.externalUrl ?? null;
    } else {
      return reply.code(400).send({ error: "invalid kind" });
    }

    if (!externalUrl) return reply.code(404).send({ error: "no such track, or it has no external URL" });

    let parsed: URL;
    try {
      parsed = new URL(externalUrl);
    } catch {
      return reply.code(400).send({ error: "stored URL is not a valid absolute URL" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return reply.code(400).send({ error: "only http/https URLs can be proxied" });
    }

    const upstreamHeaders: Record<string, string> = {};
    if (req.headers.range) upstreamHeaders.range = req.headers.range;

    let upstream: Response;
    try {
      upstream = await fetch(externalUrl, { headers: upstreamHeaders });
    } catch (err) {
      req.log.error(err, "audio-proxy: upstream fetch failed");
      return reply.code(502).send({ error: "failed to fetch the source audio" });
    }
    if (!upstream.ok && upstream.status !== 206) {
      return reply.code(502).send({ error: `upstream returned ${upstream.status}` });
    }

    reply.code(upstream.status);
    const passthroughHeaders = ["content-type", "content-length", "content-range", "accept-ranges"];
    for (const h of passthroughHeaders) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (!upstream.headers.get("accept-ranges")) reply.header("accept-ranges", "bytes");

    return reply.send(upstream.body);
  });
}
