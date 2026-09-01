import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSoundFile } from "../lib/storage.js";

export async function notificationSoundRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/notification-sounds", async () => {
    return prisma.notificationSound.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/api/admin/notification-sounds", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    let name = (file.fields.name as { value?: string } | undefined)?.value?.trim() || file.filename.replace(/\.[^.]+$/, "");
    let suffix = 1;
    while (await prisma.notificationSound.findUnique({ where: { name } })) name = `${name} ${suffix++}`;
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const format = url.split(".").pop()!;
      const sound = await prisma.notificationSound.create({ data: { name, fileUrl: url, format } });
      return reply.code(201).send(sound);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/notification-sounds/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.notificationSound.delete({ where: { id: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );

  app.get("/api/notification-events", async () => {
    return prisma.notificationEvent.findMany({ include: { defaultSound: true }, orderBy: { key: "asc" } });
  });

  app.post<{ Body: { key: string; label: string; defaultSoundId?: number } }>(
    "/api/admin/notification-events",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { key, label, defaultSoundId } = req.body ?? {};
      if (!key || !label) return reply.code(400).send({ error: "key and label are required" });
      const event = await prisma.notificationEvent.create({ data: { key, label, defaultSoundId } });
      return reply.code(201).send(event);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ label: string; defaultSoundId: number | null }> }>(
    "/api/admin/notification-events/:id",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.notificationEvent.update({ where: { id: Number(req.params.id) }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/notification-events/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.notificationEvent.delete({ where: { id: Number(req.params.id) } });
      return reply.code(204).send();
    },
  );
}
