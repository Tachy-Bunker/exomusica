import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveFontFile } from "../lib/storage.js";

function toFamilyName(name: string): string {
  return `exo-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export async function fontRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/fonts", async () => {
    return prisma.customFont.findMany({ orderBy: { name: "asc" } });
  });

  // One file per request, optionally with a display name field; defaults
  // to the filename (minus extension) if not given.
  app.post("/api/admin/fonts", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();

    let baseName = (file.fields.name as { value?: string } | undefined)?.value?.trim();
    if (!baseName) baseName = file.filename.replace(/\.[^.]+$/, "");

    let name = baseName;
    let familyName = toFamilyName(name);
    let suffix = 1;
    while (await prisma.customFont.findUnique({ where: { familyName } })) {
      name = `${baseName} ${suffix}`;
      familyName = toFamilyName(name);
      suffix++;
    }

    try {
      const { url, format } = await saveFontFile(file.filename, file.mimetype, buffer);
      const font = await prisma.customFont.create({ data: { name, familyName, fileUrl: url, format } });
      return reply.code(201).send(font);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/admin/fonts/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.customFont.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
