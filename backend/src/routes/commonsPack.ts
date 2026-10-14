import type { FastifyInstance } from "fastify";
import { ZipArchive } from "archiver";
import path from "node:path";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { makeLimiter } from "../lib/resourceAccess.js";
import { getMilestones } from "../lib/milestones.js";
import { UPLOADS_DIR } from "../lib/storage.js";
import { creditsText, entryName, monthKey, pickPack, REUSE, type PackCandidate } from "../lib/commonsPack.js";

const DIR = path.join(UPLOADS_DIR, "commons");
const fileFor = (month: string): string => path.join(DIR, `commons-${month}.zip`);
const limiter = makeLimiter(4, 10 * 60_000);
let building: Promise<void> | null = null; // one pack at a time, ever

const unlocked = async (): Promise<boolean> => !!(await getMilestones()).find((m) => m.key === "m-commons")?.reached;
// Uploaded files only (an outside link can't be packed), reuse allowed, and not a submission still waiting or turned down.
const WHERE = { permission: { in: [...REUSE] }, attachmentId: { not: null }, album: { OR: [{ submissionStatus: null }, { submissionStatus: "APPROVED" as const }] } };

async function candidates(): Promise<(PackCandidate & { disk: string })[]> {
  const rows = await prisma.communityTrack.findMany({ where: WHERE, take: 2000, select: { id: true, title: true, composer: true, permission: true, album: { select: { composer: true, owner: { select: { username: true } } } }, attachment: { select: { filename: true, storagePath: true, sizeBytes: true } } } });
  const out: (PackCandidate & { disk: string })[] = [];
  for (const r of rows) {
    const a = r.attachment; if (!a || !a.storagePath.startsWith("/uploads/")) continue;
    const disk = path.resolve(UPLOADS_DIR, a.storagePath.slice("/uploads/".length));
    if (!disk.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) continue;
    out.push({ id: r.id, title: r.title, composer: r.composer || r.album.composer || "", owner: r.album.owner.username, permission: r.permission, sizeBytes: Number(a.sizeBytes), ext: path.extname(a.filename).slice(1), disk });
  }
  return out;
}

async function build(month: string): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const picked = pickPack(await candidates(), month) as (PackCandidate & { disk: string })[];
  const real = picked.filter((c) => existsSync(c.disk));
  if (real.length === 0) return;
  const tmp = fileFor(month) + ".tmp";
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(tmp), zip = new ZipArchive({ store: true }); // audio doesn't compress: store it, so building costs almost no CPU
    out.on("close", () => resolve()); out.on("error", reject); zip.on("error", reject);
    zip.pipe(out);
    real.forEach((c, i) => zip.append(createReadStream(c.disk), { name: entryName(i, c) }));
    zip.append(creditsText(real, month), { name: "CREDITS.txt" });
    void zip.finalize();
  });
  await rename(tmp, fileFor(month));
  for (const f of await readdir(DIR)) if (/^commons-\d{4}-\d{2}\.zip$/.test(f) && f !== `commons-${month}.zip`) await unlink(path.join(DIR, f)).catch(() => undefined); // only this month's pack is kept
}

export async function commonsPackRoutes(app: FastifyInstance): Promise<void> {
  let countCache: { at: number; n: number } | null = null;
  app.get("/api/commons-pack", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await unlocked())) return { locked: true };
    const month = monthKey(new Date());
    if (!countCache || Date.now() - countCache.at > 300_000) countCache = { at: Date.now(), n: await prisma.communityTrack.count({ where: WHERE }) };
    const f = await stat(fileFor(month)).catch(() => null);
    return { locked: false, month, available: countCache.n, ready: !!f, building: !!building, bytes: f ? f.size : null };
  });

  // Starting a build needs an account (it is the only expensive thing here); downloading a finished pack is public, and a plain link so the browser streams it to disk.
  app.post("/api/commons-pack/build", { preHandler: requireAuth }, async (req, reply) => {
    if (!(await unlocked())) return reply.code(403).send({ error: "not open yet" });
    if (!limiter.hit(String(req.user!.id))) return reply.code(429).send({ error: "Slow down. Try again in a few minutes." });
    const month = monthKey(new Date());
    if (!existsSync(fileFor(month)) && !building) building = build(month).catch(() => undefined).finally(() => { building = null; });
    return reply.code(202).send({ building: true });
  });

  const dlLimiter = makeLimiter(20, 10 * 60_000);
  app.get("/api/commons-pack/download", async (req, reply) => {
    if (!(await unlocked())) return reply.code(403).send({ error: "not open yet" });
    if (!dlLimiter.hit(req.ip)) return reply.code(429).send({ error: "Slow down. Try again in a few minutes." });
    const month = monthKey(new Date());
    if (!existsSync(fileFor(month))) return reply.code(404).send({ error: "this month's pack isn't built yet" });
    return reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="exomusica-commons-${month}.zip"`).send(createReadStream(fileFor(month)));
  });
}
