import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth.js";
import { saveMessageAttachment } from "../lib/storage.js";

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/attachments", { preHandler: requireAuth }, async (req, reply) => {
    const created: { id: number; filename: string; url: string; sizeBytes: number }[] = [];
    const errors: string[] = [];

    for await (const file of req.files()) {
      try {
        const buffer = await file.toBuffer();
        const attachment = await saveMessageAttachment(req.user!.id, file.filename, file.mimetype, buffer);
        created.push({
          id: attachment.id,
          filename: attachment.filename,
          url: attachment.storagePath,
          sizeBytes: Number(attachment.sizeBytes),
        });
      } catch (err) {
        errors.push(`${file.filename}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }

    if (created.length === 0) {
      return reply.code(400).send({ error: "no attachments saved", details: errors });
    }
    return reply.code(201).send({ created, errors });
  });
}
