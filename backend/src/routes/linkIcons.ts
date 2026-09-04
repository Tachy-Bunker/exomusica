import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSiteImage } from "../lib/storage.js";

export async function linkIconRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/link-icons", async () => {
    return prisma.linkIcon.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/api/admin/link-icons", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const nameField = file.fields.name;
    const name = nameField && "value" in nameField ? String(nameField.value) : null;
    if (!name) return reply.code(400).send({ error: "name is required" });
    if (!["image/svg+xml", "image/png"].includes(file.mimetype)) return reply.code(400).send({ error: "only SVG or PNG icons are supported" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "link-icons");
      const icon = await prisma.linkIcon.create({ data: { name, url } });
      return reply.code(201).send(icon);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/admin/link-icons/:id", { preHandler: requireAdmin }, async (req) => {
    await prisma.linkIcon.delete({ where: { id: Number(req.params.id) } });
    return { status: "ok" };
  });
}
