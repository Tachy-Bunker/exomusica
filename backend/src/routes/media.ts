import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { saveMediaFile } from "../lib/storage.js";

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
}
