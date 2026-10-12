import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { makeLimiter } from "../lib/resourceAccess.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { normalizeStrip, packPoints, runFfmpeg, stripCacheName, stripSource, toPoints } from "../lib/specStrip.js";
import { cleanCommentBody, clampAt, MAX_COMMENTS_PER_TRACK } from "../lib/trackComments.js";

const limiter = makeLimiter(8, 60_000);
const inflight = new Map<number, Promise<Uint8Array | "missing" | null>>();
let queue: Promise<unknown> = Promise.resolve(); // one drawing at a time: weak VPS friendly

type Table = { findMany: (a: any) => Promise<any[]>; count: (a: any) => Promise<number>; create: (a: any) => Promise<any>; findUnique: (a: any) => Promise<any>; delete: (a: any) => Promise<any> };

/** The same strip + comments for official tracks and for community tracks. Community strips are cached under an offset id so the two never collide. */
function register(app: FastifyInstance, base: string, offset: number, table: Table, lookup: (id: number) => Promise<{ id: number; fileUrl: string } | null>, lookupDur: ((id: number) => Promise<{ id: number; durationSeconds: number | null } | null>) | null): void {
  // The strip, as 2500 bytes of measured points. Measured once per track on first request, then served from disk forever.
  app.get<{ Params: { id: string } }>(`${base}/:id/spectrogram`, async (req, reply) => {
    const id = Number(req.params.id) || 0;
    const t = await lookup(id);
    if (!t) return reply.code(404).send({ error: "no such track" });
    const dir = path.join(UPLOADS_DIR, "spectro");
    const file = path.join(dir, stripCacheName(t.id + offset, t.fileUrl));
    try {
      const hit = await readFile(file);
      return reply.header("cache-control", "public, max-age=31536000, immutable").type("application/octet-stream").send(hit);
    } catch { /* not drawn yet */ }
    const src = stripSource(t.fileUrl, UPLOADS_DIR);
    if (!src) return reply.code(422).send({ error: "this track's audio can't be drawn" });
    let job = inflight.get(id + offset);
    if (!job) {
      job = (queue = queue.then(() => runFfmpeg(src))) as Promise<Uint8Array | "missing" | null>;
      inflight.set(id + offset, job);
      void job.finally(() => inflight.delete(id + offset));
    }
    const raw = await job;
    if (raw === "missing") return reply.code(501).send({ error: "the server has no ffmpeg" });
    const norm = raw ? normalizeStrip(raw) : null;
    const pts = norm ? toPoints(norm) : null;
    if (!pts) return reply.code(422).send({ error: "this track's audio can't be drawn" });
    const packed = packPoints(pts);
    await mkdir(dir, { recursive: true });
    await writeFile(file, packed);
    return reply.header("cache-control", "public, max-age=31536000, immutable").type("application/octet-stream").send(Buffer.from(packed));
  });

  if (!lookupDur) return; // a strip only (voice notes)
  app.get<{ Params: { id: string } }>(`${base}/:id/comments`, async (req) => {
    const rows = await table.findMany({
      where: { trackId: Number(req.params.id) || 0 }, orderBy: { atSeconds: "asc" }, take: MAX_COMMENTS_PER_TRACK,
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
    return rows.map((c: any) => ({ id: c.id, atSeconds: c.atSeconds, body: c.body, createdAt: c.createdAt, user: c.user.username, avatarUrl: c.user.avatarUrl, userId: c.userId }));
  });

  app.post<{ Params: { id: string }; Body: { atSeconds?: number; body?: string } }>(`${base}/:id/comments`, { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!.id;
    const id = Number(req.params.id) || 0;
    if (!limiter.hit(String(me))) return reply.code(429).send({ error: "Slow down. Try again in a minute." });
    const body = cleanCommentBody(req.body?.body);
    if (!body) return reply.code(400).send({ error: "Write something first." });
    const t = await lookupDur(id);
    if (!t) return reply.code(404).send({ error: "no such track" });
    if ((await table.count({ where: { trackId: id } })) >= MAX_COMMENTS_PER_TRACK) return reply.code(409).send({ error: "This track has all the comments it can hold." });
    const c = await table.create({ data: { trackId: id, userId: me, atSeconds: clampAt(req.body?.atSeconds, t.durationSeconds), body } });
    return reply.code(201).send({ id: c.id, atSeconds: c.atSeconds, body: c.body, createdAt: c.createdAt, user: req.user!.username, avatarUrl: null, userId: me });
  });

  app.delete<{ Params: { id: string; cid: string } }>(`${base}/:id/comments/:cid`, { preHandler: requireAuth }, async (req, reply) => {
    const c = await table.findUnique({ where: { id: Number(req.params.cid) || 0 } });
    if (!c || c.trackId !== (Number(req.params.id) || 0)) return reply.code(404).send({ error: "no such comment" });
    if (c.userId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not yours" });
    await table.delete({ where: { id: c.id } });
    return { ok: true };
  });
}

export async function trackCommentRoutes(app: FastifyInstance): Promise<void> {
  register(app, "/api/tracks", 0, prisma.trackComment as unknown as Table,
    (id) => prisma.track.findUnique({ where: { id }, select: { id: true, fileUrl: true } }),
    (id) => prisma.track.findUnique({ where: { id }, select: { id: true, durationSeconds: true } }));
  register(app, "/api/community-tracks", 1_000_000_000, prisma.communityTrackComment as unknown as Table,
    async (id) => {
      const t = await prisma.communityTrack.findUnique({ where: { id }, select: { id: true, externalUrl: true, attachment: { select: { storagePath: true } } } });
      const url = t?.attachment?.storagePath ?? t?.externalUrl;
      return t && url ? { id: t.id, fileUrl: url } : null;
    },
    (id) => prisma.communityTrack.findUnique({ where: { id }, select: { id: true, durationSeconds: true } }));
  // Voice notes in chat get the same strip, so they can be shown and scrubbed as a picture of the sound. Only voice notes: it is not a way to draw any file.
  register(app, "/api/voice-notes", 2_000_000_000, null as unknown as Table,
    async (id) => {
      const a = await prisma.attachment.findUnique({ where: { id }, select: { id: true, filename: true, storagePath: true, messageId: true, privateMessageId: true } });
      return a && /^voice-note.*\.m4a$/i.test(a.filename) && a.messageId ? { id: a.id, fileUrl: a.storagePath } : null; // channel messages only: private ones are not served to anyone who asks
    }, null);
}
