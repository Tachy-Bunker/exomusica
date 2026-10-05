import type { FastifyInstance } from "fastify";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { FACTS_SELECT, factsOf, findReclaimable, reclaim } from "../lib/attachmentCleanup.js";
import { reclaimReason } from "../lib/attachmentRules.js";

const LOCAL_PREFIX = "/uploads/";

function isLocal(storagePath: string): boolean {
  return storagePath.startsWith(LOCAL_PREFIX);
}

async function migrateToArchiveOrg(attachmentId: number, urlPrefix: string): Promise<{ ok: boolean; error?: string }> {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return { ok: false, error: "not found" };
  if (!isLocal(attachment.storagePath)) return { ok: false, error: "already external" };
  // A study file's URL is written into the study's own text, so it can't be repointed - and archive.org doesn't
  // permit the cross-origin reads the waveform tool needs. It stays on this server.
  if (attachment.studyId !== null) return { ok: false, error: "belongs to a study - it stays on this server" };

  const newUrl = urlPrefix.replace(/\/$/, "") + "/" + encodeURIComponent(attachment.filename);
  const oldDiskPath = path.join(UPLOADS_DIR, attachment.storagePath.replace(LOCAL_PREFIX, ""));

  await prisma.attachment.update({ where: { id: attachmentId }, data: { storagePath: newUrl } });
  // Best-effort local cleanup - the swap to the DB pointer above is what
  // actually matters for the site; a leftover file if this fails just
  // means slightly wasted disk, not a broken attachment.
  try {
    await unlink(oldDiskPath);
  } catch {
    // already gone, or a permissions issue - either way, not fatal
  }
  return { ok: true };
}

export async function storageAdminRoutes(app: FastifyInstance): Promise<void> {
  // What's clutter right now: attachments of deleted messages, uploads that were never posted, and files on disk
  // that no record accounts for. A read-only report.
  app.get("/api/admin/storage/reclaimable", { preHandler: requireAdmin }, async () => findReclaimable(prisma, UPLOADS_DIR));

  app.post<{ Body: { confirm?: boolean } }>("/api/admin/storage/reclaim", { preHandler: requireAdmin }, async (req, reply) => {
    if (req.body?.confirm !== true) return reply.code(400).send({ error: "send { confirm: true } to delete - review GET /api/admin/storage/reclaimable first" });
    return reclaim(prisma, UPLOADS_DIR);
  });

  app.get("/api/admin/storage/attachments", { preHandler: requireAdmin }, async () => {
    const now = new Date();
    const all = await prisma.attachment.findMany({
      select: {
        ...FACTS_SELECT,
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        storagePath: true,
        uploader: { select: { username: true } },
        message: { select: { isDeleted: true, channel: { select: { slug: true, name: true } } } },
        communityTrack: { select: { id: true, title: true, album: { select: { title: true, slug: true } } } },
        communityAlbumCover: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // Only what's actually worth archiving: not clutter (deleted messages' files, never-posted uploads - see the
    // reclaim tool), and not study files (their URLs are part of the study text).
    const local = all.filter((a) => isLocal(a.storagePath) && a.studyId === null && reclaimReason(factsOf(a), now) === null);
    return local.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes.toString(), // BigInt isn't JSON-serializable directly
      url: a.storagePath,
      uploader: a.uploader.username,
      channel: a.message?.channel ? `${a.message.channel.name} (${a.message.channel.slug})` : null,
      communityTrack: a.communityTrack ? `${a.communityTrack.title} - ${a.communityTrack.album.title}` : null,
      communityAlbumCover: a.communityAlbumCover ? `Cover for ${a.communityAlbumCover.title}` : null,
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
      const now = new Date();
      const candidates = await prisma.attachment.findMany({ where: { storagePath: { startsWith: LOCAL_PREFIX }, studyId: null }, select: { id: true, ...FACTS_SELECT } });
      const local = candidates.filter((a) => reclaimReason(factsOf(a), now) === null); // never carry clutter over to archive.org
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
