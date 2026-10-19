import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { checkTexture, checkSky, imageType } from "../lib/png.js";
import { encodeTexMeta } from "../lib/trashEntries.js";

// SHA-256 of each library picture, by id. A picture never changes for its id, so each one is hashed once per process.
const digests = new Map<number, string>();

export async function roomTextureRoutes(app: FastifyInstance): Promise<void> {
  // Admin: the digests of the library, so a package import can reuse a picture the library already has without downloading the library.
  app.get("/api/admin/room-textures/digests", { preHandler: requireAdmin }, async () => {
    const ids = (await prisma.textureAsset.findMany({ select: { id: true } })).map((r) => r.id);
    const live = new Set(ids);
    for (const id of digests.keys()) if (!live.has(id)) digests.delete(id);
    const missing = ids.filter((id) => !digests.has(id));
    for (let i = 0; i < missing.length; i += 25) {
      const rows = await prisma.textureAsset.findMany({ where: { id: { in: missing.slice(i, i + 25) } }, select: { id: true, png: true } });
      for (const r of rows) digests.set(r.id, createHash("sha256").update(r.png).digest("hex"));
    }
    return ids.map((id) => ({ id, sha256: digests.get(id) ?? "" }));
  });

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
    const row = await prisma.textureAsset.create({ data: { name: stored, png: new Uint8Array(c.bytes) }, select: { id: true, name: true, createdAt: true } });
    return reply.code(201).send(row);
  });

  // Deleting moves the picture to the trash for 30 days, under its own id, so the rooms that use it show it again when it is restored.
  app.delete<{ Params: { id: string } }>("/api/admin/room-textures/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? await prisma.textureAsset.findUnique({ where: { id }, select: { id: true, name: true, png: true, createdAt: true } }) : null;
    if (row) {
      await prisma.$transaction([
        prisma.trashEntry.create({ data: { kind: "texture", key: String(row.id), label: `Picture “${row.name.replace(/^sky:/, "")}”`, meta: encodeTexMeta({ id: row.id, name: row.name, sky: row.name.startsWith("sky:"), createdAt: row.createdAt.toISOString() }), png: new Uint8Array(row.png) } }),
        prisma.textureAsset.deleteMany({ where: { id } }),
      ]);
    }
    return reply.code(204).send();
  });
}
