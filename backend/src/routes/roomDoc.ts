import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { cleanDoc, emptyDoc } from "../lib/roomDoc.js";
import { docLabel, encodeDocMeta } from "../lib/trashEntries.js";

// a room slug, "low~high" for the corridor between two rooms, "theme~slug" (a branch theme) or "prefab~name" (a saved group of things)
const SLUG = /^((theme|prefab)~)?[a-z0-9][a-z0-9-]{0,80}(~[a-z0-9][a-z0-9-]{0,80})?$/; // "theme~slug" is a branch's theme
/** How many saves of each room are kept for restoring; older ones are dropped on the next save. */
export const ROOM_HISTORY = 10;

/** Writes `doc` as the next version of `slug` if the editor saw `base` (else 409), and keeps it in the history. */
async function saveDoc(slug: string, doc: ReturnType<typeof cleanDoc>, base: number, reply: FastifyReply) {
  const row = await prisma.roomDoc.findUnique({ where: { slug } });
  if ((row?.version ?? 0) !== base) return reply.code(409).send({ error: "Someone saved this room since you opened it. Reload to continue.", version: row?.version ?? 0 });
  const version = (row?.version ?? 0) + 1;
  const data = JSON.stringify({ ...doc, version });
  if (data.length > 200_000) return reply.code(413).send({ error: "Room is too large" });
  if (row) await prisma.roomDoc.update({ where: { slug }, data: { doc: data, version } });
  else await prisma.roomDoc.create({ data: { slug, doc: data, version } });
  await prisma.roomDocVersion.create({ data: { slug, version, doc: data } });
  // keep the newest ROOM_HISTORY saves: find the oldest one to keep and drop anything older than it
  const edge = await prisma.roomDocVersion.findMany({ where: { slug }, select: { id: true }, orderBy: { id: "desc" }, skip: ROOM_HISTORY - 1, take: 1 });
  if (edge[0]) await prisma.roomDocVersion.deleteMany({ where: { slug, id: { lt: edge[0].id } } });
  return { version, doc: { ...doc, version } };
}

export async function roomDocRoutes(app: FastifyInstance): Promise<void> {
  // Public: every room fetches its own document once. Empty when nobody built anything there.
  app.get<{ Params: { slug: string } }>("/api/room-doc/:slug", async (req, reply) => {
    if (!SLUG.test(req.params.slug)) return reply.code(400).send({ error: "bad slug" });
    reply.header("cache-control", "public, max-age=30");
    const row = await prisma.roomDoc.findUnique({ where: { slug: req.params.slug } });
    if (!row) return { version: 0, doc: emptyDoc() };
    return { version: row.version, doc: cleanDoc(JSON.parse(row.doc)) };
  });

  // Admin: the saved prefabs (groups of things the editor can place again), newest first.
  app.get("/api/admin/room-prefabs", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.roomDoc.findMany({ where: { slug: { startsWith: "prefab~" } }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 200 });
    return rows.map((r: { slug: string; updatedAt: Date }) => ({ slug: r.slug.slice(7), at: r.updatedAt }));
  });

  // Admin: save the whole document. `baseVersion` must be what the editor loaded, else someone else saved in between.
  app.put<{ Params: { slug: string }; Body: { doc?: unknown; baseVersion?: number } }>("/api/admin/room-doc/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG.test(slug)) return reply.code(400).send({ error: "bad slug" });
    return saveDoc(slug, cleanDoc(req.body?.doc), Number(req.body?.baseVersion ?? 0), reply);
  });

  // Admin: the saved versions of a room, newest first (the documents themselves are fetched by restoring one).
  app.get<{ Params: { slug: string } }>("/api/admin/room-doc/:slug/history", { preHandler: requireAdmin }, async (req, reply) => {
    if (!SLUG.test(req.params.slug)) return reply.code(400).send({ error: "bad slug" });
    const rows = await prisma.roomDocVersion.findMany({ where: { slug: req.params.slug }, select: { id: true, version: true, savedAt: true }, orderBy: { id: "desc" }, take: ROOM_HISTORY });
    return rows.map((r: { id: number; version: number; savedAt: Date }) => ({ id: r.id, version: r.version, savedAt: r.savedAt.toISOString() }));
  });

  // Admin: make a saved version the room again. It is saved as a new version, so nothing is lost; `baseVersion` is what the editor loaded.
  app.post<{ Params: { slug: string; id: string }; Body: { baseVersion?: number } }>("/api/admin/room-doc/:slug/restore/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params, id = Number(req.params.id);
    if (!SLUG.test(slug) || !Number.isInteger(id)) return reply.code(400).send({ error: "bad request" });
    const old = await prisma.roomDocVersion.findFirst({ where: { id, slug } });
    if (!old) return reply.code(404).send({ error: "That version is gone" });
    return saveDoc(slug, cleanDoc(JSON.parse(old.doc)), Number(req.body?.baseVersion ?? 0), reply);
  });

  // Deleting moves the room (a prefab, a theme) and its saved versions to the trash for 30 days; an admin can restore it from there.
  app.delete<{ Params: { slug: string } }>("/api/admin/room-doc/:slug", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params;
    const row = await prisma.roomDoc.findUnique({ where: { slug } });
    if (row) {
      const versions = await prisma.roomDocVersion.findMany({ where: { slug }, orderBy: { id: "desc" }, take: ROOM_HISTORY, select: { version: true, doc: true, savedAt: true } });
      await prisma.$transaction([
        prisma.trashEntry.create({ data: { kind: "doc", key: slug, label: docLabel(slug), meta: encodeDocMeta({ version: row.version, history: versions.map((v) => ({ version: v.version, doc: v.doc, savedAt: v.savedAt.toISOString() })) }), doc: row.doc } }),
        prisma.roomDoc.deleteMany({ where: { slug } }),
        prisma.roomDocVersion.deleteMany({ where: { slug } }),
      ]);
    }
    return reply.code(204).send();
  });
}
