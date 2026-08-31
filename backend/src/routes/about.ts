import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSiteImage } from "../lib/storage.js";

export async function aboutRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/about-features", async () => {
    return prisma.aboutFeature.findMany({
      include: { collaborator: true },
      orderBy: { position: "asc" },
    });
  });

  app.post<{
    Body: { kind: "COLLABORATOR" | "AWARD" | "CUSTOM"; collaboratorId?: number; title?: string; description?: string };
  }>("/api/admin/about-features", { preHandler: requireAdmin }, async (req, reply) => {
    const { kind, collaboratorId, title, description } = req.body ?? {};
    if (!kind) return reply.code(400).send({ error: "kind is required" });
    if (kind === "COLLABORATOR" && !collaboratorId) {
      return reply.code(400).send({ error: "collaboratorId is required for a COLLABORATOR feature" });
    }
    if (kind !== "COLLABORATOR" && !title) {
      return reply.code(400).send({ error: "title is required for AWARD/CUSTOM features" });
    }
    const position = await prisma.aboutFeature.count();
    const feature = await prisma.aboutFeature.create({
      data: { kind, collaboratorId, title, description, position },
    });
    return reply.code(201).send(feature);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; description: string }>;
  }>("/api/admin/about-features/:id", { preHandler: requireAdmin }, async (req) => {
    return prisma.aboutFeature.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/about-features/:id/image",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      const buffer = await file.toBuffer();
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "about");
      const feature = await prisma.aboutFeature.update({
        where: { id: Number(req.params.id) },
        data: { imageUrl: url },
      });
      return { imageUrl: feature.imageUrl };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/about-features/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.aboutFeature.delete({ where: { id: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );

  // Swaps two features' positions — the admin UI moves one item up/down at
  // a time rather than sending a full reordered list, so a simple swap is
  // all this needs.
  app.post<{ Body: { idA: number; idB: number } }>(
    "/api/admin/about-features/swap",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { idA, idB } = req.body ?? {};
      const [a, b] = await Promise.all([
        prisma.aboutFeature.findUnique({ where: { id: idA } }),
        prisma.aboutFeature.findUnique({ where: { id: idB } }),
      ]);
      if (!a || !b) return reply.code(404).send({ error: "feature not found" });
      await prisma.$transaction([
        prisma.aboutFeature.update({ where: { id: a.id }, data: { position: b.position } }),
        prisma.aboutFeature.update({ where: { id: b.id }, data: { position: a.position } }),
      ]);
      return reply.code(204).send();
    },
  );
}
