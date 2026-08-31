import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveEmojiFile } from "../lib/storage.js";

export async function emojiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/emojis", async () => {
    return prisma.customEmoji.findMany({
      select: { id: true, name: true, imageUrl: true },
      orderBy: { name: "asc" },
    });
  });

  // Accepts one or many files in a single multipart request — this is the
  // "import a big palette at once" path as well as the single-emoji path,
  // same endpoint either way.
  app.post("/api/admin/emojis", { preHandler: requireAdmin }, async (req, reply) => {
    const created: { id: number; name: string; imageUrl: string }[] = [];
    const errors: string[] = [];

    for await (const file of req.files()) {
      try {
        const buffer = await file.toBuffer();
        const { url, suggestedName } = await saveEmojiFile(file.filename, file.mimetype, buffer);

        let name = suggestedName;
        let suffix = 1;
        while (await prisma.customEmoji.findUnique({ where: { name } })) {
          name = `${suggestedName}_${suffix++}`;
        }

        const emoji = await prisma.customEmoji.create({
          data: { name, imageUrl: url, uploadedById: req.user!.id, isPaletteImport: true },
        });
        created.push(emoji);
      } catch (err) {
        errors.push(`${file.filename}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }

    if (created.length === 0) {
      return reply.code(400).send({ error: "no emojis created", details: errors });
    }
    return reply.code(201).send({ created, errors });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/emojis/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.customEmoji.delete({ where: { id: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );
}
