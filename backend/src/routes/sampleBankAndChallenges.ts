import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { deleteAttachmentAndReclaim, saveCommunityAlbumCover, saveSampleBankFile } from "../lib/storage.js";

function kindFromMime(mimeType: string): "AUDIO" | "PATCH" | "SCRIPT" | "OTHER" {
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.includes("json") || mimeType.includes("xml")) return "PATCH";
  if (mimeType.startsWith("text/")) return "SCRIPT";
  return "OTHER";
}

export async function sampleBankAndChallengesRoutes(app: FastifyInstance): Promise<void> {
  // --- Sample bank ----------------------------------------------------------

  app.get<{ Querystring: { tag?: string } }>("/api/sample-bank", async (req) => {
    const items = await prisma.sampleBankItem.findMany({
      where: req.query.tag ? { tags: { has: req.query.tag } } : undefined,
      include: { owner: { select: { username: true } }, attachment: { select: { storagePath: true, filename: true } } },
      orderBy: { createdAt: "desc" },
    });
    return items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      tags: i.tags,
      kind: i.kind,
      fileUrl: i.attachment.storagePath,
      filename: i.attachment.filename,
      owner: i.owner.username,
      cover: i.imageUrls[0] ?? null,
      gallery: i.imageUrls.slice(1),
      createdAt: i.createdAt,
    }));
  });

  app.post("/api/sample-bank", { preHandler: requireAuth }, async (req, reply) => {
    // Fields and files arrive in any order: the sound itself ("file"), an optional "cover" image and up to three "gallery" images.
    const fields: Record<string, string> = {};
    let sound: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    let cover: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    const gallery: { filename: string; mimetype: string; buffer: Buffer }[] = [];
    for await (const part of req.parts()) {
      if (part.type === "field") { fields[part.fieldname] = String(part.value ?? ""); continue; }
      const buffer = await part.toBuffer();
      const entry = { filename: part.filename, mimetype: part.mimetype, buffer };
      if (part.fieldname === "file") sound = entry;
      else if (part.fieldname === "cover") cover = entry;
      else if (part.fieldname === "gallery") { if (gallery.length < 3) gallery.push(entry); }
    }
    if (!sound) return reply.code(400).send({ error: "no file uploaded" });
    const title = fields.title?.trim();
    if (!title) return reply.code(400).send({ error: "title is required" });
    const description = fields.description?.trim() || null;
    const tags = (fields.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    const savedImages: { id: number; url: string }[] = [];
    let attachment;
    try {
      attachment = await saveSampleBankFile(req.user!.id, sound.filename, sound.mimetype, sound.buffer);
      for (const img of [...(cover ? [cover] : []), ...gallery]) {
        const a = await saveCommunityAlbumCover(req.user!.id, img.filename, img.mimetype, img.buffer);
        savedImages.push({ id: a.id, url: a.storagePath });
      }
    } catch (err) {
      for (const img of savedImages) await deleteAttachmentAndReclaim(img.id).catch(() => {});
      if (attachment) await deleteAttachmentAndReclaim(attachment.id).catch(() => {});
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
    const item = await prisma.sampleBankItem.create({
      data: { ownerId: req.user!.id, title, description, tags, kind: kindFromMime(sound.mimetype), attachmentId: attachment.id, imageUrls: savedImages.map((i) => i.url), imageAttachmentIds: savedImages.map((i) => i.id) },
    });
    return reply.code(201).send(item);
  });

  app.delete<{ Params: { id: string } }>("/api/sample-bank/:id", { preHandler: requireAuth }, async (req, reply) => {
    const item = await prisma.sampleBankItem.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return reply.code(404).send({ error: "no such item" });
    if (item.ownerId !== req.user!.id) return reply.code(403).send({ error: "not yours" });
    await prisma.sampleBankItem.delete({ where: { id: item.id } });
    for (const id of item.imageAttachmentIds) await deleteAttachmentAndReclaim(id).catch(() => {});
    return { status: "ok" };
  });

  // --- Challenges -------------------------------------------------------

  app.get("/api/challenges", async () => {
    const challenges = await prisma.challenge.findMany({
      include: { _count: { select: { submissions: true } } },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return challenges.map((c) => ({ id: c.id, title: c.title, prompt: c.prompt, active: c.active, submissionCount: c._count.submissions, createdAt: c.createdAt }));
  });

  app.get<{ Params: { id: string } }>("/api/challenges/:id", async (req, reply) => {
    const challenge = await prisma.challenge.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        submissions: {
          include: {
            user: { select: { username: true } },
            track: { include: { album: { select: { title: true, slug: true, coverArtUrl: true } }, attachment: { select: { storagePath: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!challenge) return reply.code(404).send({ error: "no such challenge" });
    return {
      id: challenge.id,
      title: challenge.title,
      prompt: challenge.prompt,
      active: challenge.active,
      submissions: challenge.submissions.map((s) => ({
        id: s.id,
        username: s.user.username,
        trackTitle: s.track.title,
        albumTitle: s.track.album.title,
        albumSlug: s.track.album.slug,
        coverArtUrl: s.track.album.coverArtUrl,
        fileUrl: s.track.attachment?.storagePath ?? s.track.externalUrl ?? "",
      })),
    };
  });

  app.post<{ Body: { title: string; prompt: string } }>("/api/admin/challenges", { preHandler: requireAdmin }, async (req, reply) => {
    const { title, prompt } = req.body ?? {};
    if (!title || !prompt) return reply.code(400).send({ error: "title and prompt are required" });
    const challenge = await prisma.challenge.create({ data: { title, prompt } });
    return reply.code(201).send(challenge);
  });

  app.patch<{ Params: { id: string }; Body: { active: boolean } }>("/api/admin/challenges/:id", { preHandler: requireAdmin }, async (req) => {
    return prisma.challenge.update({ where: { id: Number(req.params.id) }, data: { active: req.body.active } });
  });

  app.post<{ Params: { id: string }; Body: { trackId: number } }>("/api/challenges/:id/submit", { preHandler: requireAuth }, async (req, reply) => {
    const challenge = await prisma.challenge.findUnique({ where: { id: Number(req.params.id) } });
    if (!challenge) return reply.code(404).send({ error: "no such challenge" });
    if (!challenge.active) return reply.code(400).send({ error: "this challenge is no longer accepting submissions" });
    const track = await prisma.communityTrack.findUnique({ where: { id: req.body.trackId }, include: { album: true } });
    if (!track || track.album.ownerId !== req.user!.id) return reply.code(403).send({ error: "you can only submit your own tracks" });
    try {
      const submission = await prisma.challengeSubmission.create({
        data: { challengeId: challenge.id, trackId: track.id, userId: req.user!.id },
      });
      return reply.code(201).send(submission);
    } catch {
      return reply.code(409).send({ error: "already submitted this track to this challenge" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/challenge-submissions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const submission = await prisma.challengeSubmission.findUnique({ where: { id: Number(req.params.id) } });
    if (!submission) return reply.code(404).send({ error: "no such submission" });
    if (submission.userId !== req.user!.id) return reply.code(403).send({ error: "not yours" });
    await prisma.challengeSubmission.delete({ where: { id: submission.id } });
    return { status: "ok" };
  });
}
