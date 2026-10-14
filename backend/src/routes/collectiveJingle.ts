import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getMilestones } from "../lib/milestones.js";
import { monthKey, REUSE } from "../lib/commonsPack.js";
import { motifFrom, pickSources } from "../lib/collectiveJingle.js";
import { stripSource } from "../lib/specStrip.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { drawStrip, drawingCount, readCachedStrip } from "../lib/stripJobs.js";

const COMMUNITY_OFFSET = 1_000_000_000;
const WHERE = { permission: { in: [...REUSE] }, attachmentId: { not: null }, album: { OR: [{ submissionStatus: null }, { submissionStatus: "APPROVED" as const }] } };
interface Seed { locked: boolean; ready: boolean; month?: string; notes?: number[]; credits?: { title: string; by: string }[] }
let cache: { at: number; month: string; seed: Seed } | null = null;

async function build(month: string): Promise<Seed> {
  const ids = (await prisma.communityTrack.findMany({ where: WHERE, select: { id: true }, take: 2000 })).map((r) => r.id);
  const picks = pickSources(ids, month, 8);
  if (picks.length < 2) return { locked: false, ready: false, month };
  const rows = await prisma.communityTrack.findMany({ where: { id: { in: picks } }, select: { id: true, title: true, composer: true, album: { select: { composer: true, owner: { select: { username: true } } } }, attachment: { select: { storagePath: true } } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const got: { strip: Uint8Array; title: string; by: string }[] = []; let started = 0;
  for (const id of picks) {
    if (got.length >= 4) break;
    const r = byId.get(id), url = r?.attachment?.storagePath; if (!r || !url || !stripSource(url, UPLOADS_DIR)) continue;
    const hit = await readCachedStrip(r.id, url, COMMUNITY_OFFSET);
    if (hit) { got.push({ strip: new Uint8Array(hit), title: r.title, by: r.composer || r.album.composer || r.album.owner.username }); continue; }
    if (started < 2 && drawingCount() < 4) { started++; void drawStrip(r.id, url, COMMUNITY_OFFSET).catch(() => undefined); } // a couple of drawings per refresh, never a burst
  }
  const notes = motifFrom(got.map((g) => g.strip));
  return notes ? { locked: false, ready: true, month, notes, credits: got.map((g) => ({ title: g.title, by: g.by })) } : { locked: false, ready: false, month };
}

export async function collectiveJingleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/collective-jingle", async (_req, reply) => {
    if (!(await getMilestones()).find((m) => m.key === "m-jingle")?.reached) { reply.header("Cache-Control", "no-store"); return { locked: true, ready: false } satisfies Seed; }
    const month = monthKey(new Date());
    const fresh = cache && cache.month === month && Date.now() - cache.at < (cache.seed.ready ? 3_600_000 : 60_000); // a finished motif is kept for an hour; an unfinished one is retried every minute as strips get drawn
    if (!fresh) cache = { at: Date.now(), month, seed: await build(month) };
    reply.header("Cache-Control", "public, max-age=300");
    return cache!.seed;
  });
}
