import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { checkTexture, checkSky, imageType } from "../lib/png.js";

export async function roomTextureRoutes(app: FastifyInstance): Promise<void> {
  // Public: the picture itself. It never changes for an id, so browsers keep it for good.
  app.get<{ Params: { id: string } }>("/api/room-textures/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? await prisma.textureAsset.findUnique({ where: { id }, select: { png: true } }) : null;
    if (!row) return reply.code(404).send({ error: "not found" });
    const buf = Buffer.from(row.png);
    return reply.type(imageType(buf) ?? "image/png").header("cache-control", "public, max-age=31536000, immutable").send(buf);
  });

  app.get("/api/admin/room-textures", { preHandler: requireAdmin }, async () =>
    (await prisma.textureAsset.findMany({ orderBy: { id: "desc" }, select: { id: true, name: true, createdAt: true }, take: 300 })).map((r) => ({ ...r, sky: r.name.startsWith("sky:") })));

  app.post<{ Body: { name?: string; png?: string; sky?: boolean } }>("/api/admin/room-textures", { preHandler: requireAdmin, bodyLimit: 600_000 }, async (req, reply) => {
    const isSky = req.body?.sky === true, c = isSky ? checkSky(req.body?.png) : checkTexture(req.body?.png);
    if (!c.ok) return reply.code(400).send({ error: c.error });
    if ((await prisma.textureAsset.count()) >= 300) return reply.code(409).send({ error: "The texture library is full (300). Delete some first." });
    const name = String(req.body?.name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) || (isSky ? "sky" : "texture");
    const stored = isSky ? "sky:" + name.replace(/^sky:/, "") : name.replace(/^sky:/, "");
    const row = await prisma.textureAsset.create({ data: { name: stored, png: c.bytes }, select: { id: true, name: true, createdAt: true } });
    return reply.code(201).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/room-textures/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.textureAsset.deleteMany({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
