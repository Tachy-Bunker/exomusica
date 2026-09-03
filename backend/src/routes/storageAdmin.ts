import type { FastifyInstance } from "fastify";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { UPLOADS_DIR } from "../lib/storage.js";

const LOCAL_PREFIX = "/uploads/";

function isLocal(storagePath: string): boolean {
  return storagePath.startsWith(LOCAL_PREFIX);
}

async function migrateToArchiveOrg(attachmentId: number, urlPrefix: string): Promise<{ ok: boolean; error?: string }> {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return { ok: false, error: "not found" };
  if (!isLocal(attachment.storagePath)) return { ok: false, error: "already external" };

  const newUrl = urlPrefix.replace(/\/$/, "") + "/" + encodeURIComponent(attachment.filename);
  const oldDiskPath = path.join(UPLOADS_DIR, attachment.storagePath.replace(LOCAL_PREFIX, ""));

  await prisma.attachment.update({ where: { id: attachmentId }, data: { storagePath: newUrl } });
  // Best-effort local cleanup — the swap to the DB pointer above is what
  // actually matters for the site; a leftover file if this fails just
  // means slightly wasted disk, not a broken attachment.
  try {
    await unlink(oldDiskPath);
  } catch {
    // already gone, or a permissions issue — either way, not fatal
  }
  return { ok: true };
}

export async function storageAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/storage/attachments", { preHandler: requireAdmin }, async () => {
    const all = await prisma.attachment.findMany({
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        storagePath: true,
        createdAt: true,
        uploader: { select: { username: true } },
        message: { select: { channel: { select: { slug: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const local = all.filter((a) => isLocal(a.storagePath));
    return local.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes.toString(), // BigInt isn't JSON-serializable directly
      url: a.storagePath,
      uploader: a.uploader.username,
      channel: a.message?.channel ? `${a.message.channel.name} (${a.message.channel.slug})` : null,
      createdAt: a.createdAt,
    }));
  });

  app.post<{ Params: { id: string }; Body: { archiveOrgPrefix: string } }>(
    "/api/admin/storage/attachments/:id/migrate",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { archiveOrgPrefix } = req.body ?? {};
      if (!archiveOrgPrefix) return reply.code(400).send({ error: "archiveOrgPrefix is required" });
      const result = await migrateToArchiveOrg(Number(req.params.id), archiveOrgPrefix);
      if (!result.ok) return reply.code(400).send({ error: result.error });
      return { status: "migrated" };
    },
  );

  app.post<{ Body: { archiveOrgPrefix: string } }>(
    "/api/admin/storage/migrate-all",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { archiveOrgPrefix } = req.body ?? {};
      if (!archiveOrgPrefix) return reply.code(400).send({ error: "archiveOrgPrefix is required" });
      const local = await prisma.attachment.findMany({ where: { storagePath: { startsWith: LOCAL_PREFIX } }, select: { id: true } });
      let migrated = 0;
      let failed = 0;
      for (const a of local) {
        const result = await migrateToArchiveOrg(a.id, archiveOrgPrefix);
        if (result.ok) migrated++;
        else failed++;
      }
      return { migrated, failed };
    },
  );
}
