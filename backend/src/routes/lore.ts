import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanLore, type LoreInput } from "../lib/lore.js";

export async function loreRoutes(app: FastifyInstance): Promise<void> {
  // Public: everything is shown only once someone scans the thing, but the list is small text, so the room fetches it once.
  app.get("/api/lore", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return prisma.loreEntry.findMany({ orderBy: { key: "asc" }, select: { id: true, key: true, title: true, body: true } });
  });

  app.post<{ Body: LoreInput }>("/api/admin/lore", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanLore(req.body ?? {}, false);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    if (await prisma.loreEntry.findUnique({ where: { key: r.data.key! } })) return reply.code(409).send({ error: "There is already lore for that key" });
    return reply.code(201).send(await prisma.loreEntry.create({ data: { key: r.data.key!, title: r.data.title!, body: r.data.body! } }));
  });

  app.patch<{ Params: { id: string }; Body: LoreInput }>("/api/admin/lore/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const r = cleanLore(req.body ?? {}, true);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const id = Number(req.params.id);
    if (!(await prisma.loreEntry.findUnique({ where: { id }, select: { id: true } }))) return reply.code(404).send({ error: "not found" });
    if (r.data.key) { const other = await prisma.loreEntry.findUnique({ where: { key: r.data.key }, select: { id: true } }); if (other && other.id !== id) return reply.code(409).send({ error: "There is already lore for that key" }); }
    return prisma.loreEntry.update({ where: { id }, data: r.data });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/lore/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.loreEntry.deleteMany({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });
}
