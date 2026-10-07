import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSiteImage, saveSoundFile } from "../lib/storage.js";

export async function guideAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/guide-assets", async () => {
    return prisma.guideAsset.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/api/admin/guide-assets", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    let name = (file.fields.name as { value?: string } | undefined)?.value?.trim() || file.filename.replace(/\.[^.]+$/, "");
    let suffix = 1;
    while (await prisma.guideAsset.findUnique({ where: { name } })) name = `${name} ${suffix++}`;
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "guide");
      const asset = await prisma.guideAsset.create({ data: { name, gifUrl: url } });
      return reply.code(201).send(asset);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/admin/guide-assets/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.guideAsset.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  // The picture that stands in for a branch's emblem (Soundbay, the homepage map). Uploading also sets it; DELETE puts the emblem back.
  app.post<{ Params: { id: string } }>("/api/admin/branches/:id/identity-image", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "branch-identity");
      const branch = await prisma.branch.update({ where: { id: Number(req.params.id) }, data: { identityImageUrl: url } });
      return { identityImageUrl: branch.identityImageUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });
  app.delete<{ Params: { id: string } }>("/api/admin/branches/:id/identity-image", { preHandler: requireAdmin }, async (req) => {
    await prisma.branch.update({ where: { id: Number(req.params.id) }, data: { identityImageUrl: null } });
    return { status: "ok" };
  });

  // Voiceover audio upload for a branch's first-time intro.
  app.post<{ Params: { id: string } }>("/api/admin/branches/:id/voiceover", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const branch = await prisma.branch.update({ where: { id: Number(req.params.id) }, data: { voiceoverUrl: url } });
      return { voiceoverUrl: branch.voiceoverUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/admin/branches/:id/voiceover", { preHandler: requireAdmin }, async (req) => {
    await prisma.branch.update({ where: { id: Number(req.params.id) }, data: { voiceoverUrl: null } });
    return { status: "ok" };
  });
}
