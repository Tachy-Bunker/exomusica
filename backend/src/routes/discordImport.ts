import type { FastifyInstance } from "fastify";
import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { importDiscordRows, type DiscordRow, type AttachmentResolver } from "../lib/discordImport.js";

export async function discordImportRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/admin/import/discord-csv", { preHandler: requireAdmin }, async (req, reply) => {
    const parts = req.parts();
    let csvBuffer: Buffer | null = null;
    let channelSlug: string | null = null;
    let archiveOrgPrefix: string | null = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        csvBuffer = await part.toBuffer();
      } else if (part.type === "field" && part.fieldname === "channelSlug") {
        channelSlug = String(part.value);
      } else if (part.type === "field" && part.fieldname === "archiveOrgPrefix") {
        archiveOrgPrefix = String(part.value) || null;
      }
    }

    if (!csvBuffer) return reply.code(400).send({ error: "no CSV file uploaded" });
    if (!channelSlug) return reply.code(400).send({ error: "channelSlug is required" });

    const channel = await prisma.forumChannel.findUnique({ where: { slug: channelSlug } });
    if (!channel) return reply.code(404).send({ error: `no channel with slug "${channelSlug}"` });

    let rows: DiscordRow[];
    try {
      rows = parse(csvBuffer, { columns: true, skip_empty_lines: true });
    } catch (err) {
      return reply.code(400).send({ error: `could not parse CSV: ${err instanceof Error ? err.message : "unknown error"}` });
    }

    const attachments: AttachmentResolver = archiveOrgPrefix ? { kind: "archiveOrg", urlPrefix: archiveOrgPrefix } : { kind: "none" };

    try {
      const summary = await importDiscordRows(prisma, channel.id, rows, attachments);
      return summary;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "import failed" });
    }
  });
}
