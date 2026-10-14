import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getMilestones } from "../lib/milestones.js";
import { stripSource } from "../lib/specStrip.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { parseIds, WALL_PAGE } from "../lib/wallIds.js";
import { drawStrip, drawingCount, readCachedStrip } from "../lib/stripJobs.js";

const MAX_DRAW_PER_CALL = 2; // a visit starts at most this many new drawings
const MAX_DRAWING = 4;       // and none at all while this many are already waiting: the wall fills in slowly on purpose
const VISIBLE = { album: { branch: { visibility: { not: "HIDDEN" as const } } } };

async function unlocked(): Promise<boolean> {
  return !!(await getMilestones()).find((m) => m.key === "m-spectral")?.reached;
}

export async function spectralWallRoutes(app: FastifyInstance): Promise<void> {
  // The tiles, newest albums first. Locked until the community reaches Spectral wall.
  app.get<{ Querystring: { offset?: string } }>("/api/spectral-wall", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await unlocked())) return { locked: true, total: 0, tracks: [] };
    const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(req.query.offset)) || 0));
    const [total, rows] = await Promise.all([
      prisma.track.count({ where: VISIBLE }),
      prisma.track.findMany({ where: VISIBLE, orderBy: [{ albumId: "desc" }, { position: "asc" }], skip: offset, take: WALL_PAGE, select: { id: true, title: true, durationSeconds: true, album: { select: { slug: true, title: true, branch: { select: { slug: true, name: true } } } } } }),
    ]);
    return { locked: false, total, tracks: rows.map((t) => ({ id: t.id, title: t.title, seconds: t.durationSeconds, album: t.album.slug, albumTitle: t.album.title, branch: t.album.branch.name })) };
  });

  // The strips for some tiles: the ones already drawn come back at once; for the rest, a couple are started and listed as pending, to ask again later.
  app.get<{ Querystring: { ids?: string } }>("/api/spectral-wall/strips", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await unlocked())) return { locked: true, strips: {}, pending: [] };
    const ids = parseIds(req.query.ids);
    if (ids.length === 0) return { locked: false, strips: {}, pending: [] };
    const tracks = await prisma.track.findMany({ where: { id: { in: ids }, ...VISIBLE }, select: { id: true, fileUrl: true } });
    const strips: Record<number, string> = {}, pending: number[] = [];
    let started = 0;
    for (const t of tracks) {
      const hit = await readCachedStrip(t.id, t.fileUrl, 0);
      if (hit) { strips[t.id] = hit.toString("base64"); continue; }
      if (!stripSource(t.fileUrl, UPLOADS_DIR)) continue; // can't be drawn: leave the tile plain
      pending.push(t.id);
      if (started < MAX_DRAW_PER_CALL && drawingCount() < MAX_DRAWING) { started++; void drawStrip(t.id, t.fileUrl, 0).catch(() => undefined); }
    }
    return { locked: false, strips, pending };
  });
}
