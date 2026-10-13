import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { trackToDTO } from "../lib/embeds.js";
import { autoBlock, blockFor, locate, orderTracks, runEnd, runStart, type Block } from "../lib/radio.js";

// A branch's playable catalogue changes rarely; a minute of memory keeps the endpoint cheap when many people are tuned in.
const catalogue = new Map<string, { at: number; tracks: Awaited<ReturnType<typeof load>> }>();
type Row = Awaited<ReturnType<typeof load>>[number];
async function load(slug: string) {
  return prisma.track.findMany({
    where: { album: { branch: { slug } }, durationSeconds: { gte: 1 } },
    include: { album: { include: { branch: true } }, bookmarks: true, collaborators: { include: { collaborator: true } } },
  });
}
async function tracksOf(slug: string) {
  const hit = catalogue.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.tracks;
  const tracks = await load(slug);
  catalogue.set(slug, { at: Date.now(), tracks });
  return tracks;
}

export async function radioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/radio/now", async (req, reply) => {
    const now = Date.now();
    const hour = new Date(now).getUTCHours();
    const branches = await prisma.branch.findMany({ where: { visibility: "VISIBLE", albums: { some: { tracks: { some: { durationSeconds: { gte: 1 } } } } } }, orderBy: { slug: "asc" }, select: { slug: true, name: true, channel: { select: { slug: true } } } });
    if (branches.length === 0) return reply.code(404).send({ error: "nothing to play yet" });
    const known = new Set(branches.map((b) => b.slug));
    const rows = await prisma.radioBlock.findMany({ include: { branch: { select: { slug: true } } } });
    const blocks: Block[] = rows.filter((r) => known.has(r.branch.slug)).map((r) => ({ startHour: r.startHour, hours: r.hours, branchSlug: r.branch.slug }));
    const block = blockFor(blocks, hour) ?? autoBlock(branches.map((b) => b.slug), hour)!;
    const branch = branches.find((b) => b.slug === block.branchSlug)!;
    const start = runStart(block, now);
    const day = new Date(start).toISOString().slice(0, 10);
    const ordered = orderTracks<Row>(await tracksOf(branch.slug), `${branch.slug}-${day}-${block.startHour}`);
    const at = locate<Row>(ordered, (now - start) / 1000);
    if (!at) return reply.code(404).send({ error: "nothing to play yet" });
    reply.header("Cache-Control", "no-store");
    return {
      branch: { slug: branch.slug, name: branch.name, channelSlug: branch.channel?.slug ?? null },
      track: trackToDTO(at.track),
      offset: Math.round(at.offset * 10) / 10,
      remaining: Math.round(at.remaining * 10) / 10,
      upcoming: at.upcoming.map((t) => ({ id: t.id, title: t.title, albumTitle: t.album.title })),
      blockEndsAt: runEnd(block, now),
      serverNow: now,
    };
  });

  app.get("/api/admin/radio", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.radioBlock.findMany({ orderBy: { startHour: "asc" }, include: { branch: { select: { slug: true, name: true } } } });
    return rows.map((r) => ({ id: r.id, startHour: r.startHour, hours: r.hours, branch: r.branch }));
  });
  app.post<{ Body: { branchId?: number; startHour?: number; hours?: number } }>("/api/admin/radio", { preHandler: requireAdmin }, async (req, reply) => {
    const { branchId, startHour, hours } = req.body ?? {};
    if (!Number.isInteger(branchId) || !Number.isInteger(startHour) || !Number.isInteger(hours) || startHour! < 0 || startHour! > 23 || hours! < 1 || hours! > 24) return reply.code(400).send({ error: "branch, a start hour 0-23 and a length of 1-24 hours are required" });
    if ((await prisma.radioBlock.count()) >= 24) return reply.code(400).send({ error: "at most 24 blocks" });
    return reply.code(201).send(await prisma.radioBlock.create({ data: { branchId: branchId!, startHour: startHour!, hours: hours! } }));
  });
  app.delete<{ Params: { id: string } }>("/api/admin/radio/:id", { preHandler: requireAdmin }, async (req) => {
    await prisma.radioBlock.delete({ where: { id: Number(req.params.id) } });
    return { ok: true };
  });
}
