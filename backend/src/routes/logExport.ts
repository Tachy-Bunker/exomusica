import type { FastifyInstance } from "fastify";
import { ZipArchive } from "archiver";
import { createReadStream, createWriteStream, existsSync, renameSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { fillTokens, hasTokens } from "../lib/newsTokens.js";
import { getTokenStats } from "../lib/milestones.js";
import { buildLogExport, type LogData } from "../lib/logExport.js";

// The whole Log as a zip of Markdown. It reads what the Log shows to a visitor (wiki pages, published news, studies;
// a hidden branch's name is left out of a study, as on the study pages). The zip is built at most once a minute and shared by everyone who asks.
const TTL_MS = 60_000;
const FILE = path.join(os.tmpdir(), "exomusica-log-export.zip");
let building: Promise<void> | null = null;

async function load(): Promise<LogData> {
  const [wikiRows, newsRows, studyRows] = await Promise.all([
    prisma.wikiPage.findMany({ select: { id: true, slug: true, title: true, parentId: true, contentMarkdown: true, updatedAt: true } }),
    prisma.blogPost.findMany({ where: { publishedAt: { not: null } }, select: { slug: true, title: true, contentMarkdown: true, publishedAt: true }, orderBy: { publishedAt: "desc" } }),
    prisma.study.findMany({
      select: {
        slug: true, title: true, body: true, status: true, updatedAt: true,
        owner: { select: { username: true } },
        branches: { select: { name: true, visibility: true } },
        annotations: { select: { position: true, text: true } },
        charts: { select: { position: true, title: true, kind: true, xLabel: true, yLabel: true, dataCsv: true } },
      },
    }),
  ]);
  // News shows its tokens filled in ({{BRANCHTRACKCOUNT}} and friends), so the export does too; the stats are read once.
  const stats = newsRows.some((r) => hasTokens(r.title) || hasTokens(r.contentMarkdown)) ? await getTokenStats() : null;
  const news = newsRows.map((r) => ({
    slug: r.slug,
    title: stats && hasTokens(r.title) ? fillTokens(r.title, stats) : r.title,
    contentMarkdown: stats && hasTokens(r.contentMarkdown) ? fillTokens(r.contentMarkdown, stats) : r.contentMarkdown,
    publishedAt: r.publishedAt as Date,
  }));
  return {
    wiki: wikiRows,
    news,
    studies: studyRows.map((s) => ({
      slug: s.slug, title: s.title, body: s.body, status: s.status, updatedAt: s.updatedAt, owner: s.owner.username,
      branches: s.branches.filter((b) => b.visibility !== "HIDDEN").map((b) => ({ name: b.name })),
      annotations: s.annotations, charts: s.charts,
    })),
  };
}

async function build(): Promise<void> {
  const exported = buildLogExport(await load(), { base: process.env.PUBLIC_URL ?? "", today: new Date() });
  const tmp = FILE + ".tmp";
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(tmp), zip = new ZipArchive({ zlib: { level: 6 } });
    out.on("close", () => resolve());
    out.on("error", reject);
    zip.on("error", reject);
    zip.pipe(out);
    for (const f of exported.files) zip.append(f.text, { name: f.path });
    void zip.finalize();
  });
  renameSync(tmp, FILE); // a reader either gets the old zip or the new one, never half of one
}

export async function logExportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/log/export.zip", async (_req, reply) => {
    const fresh = existsSync(FILE) && Date.now() - statSync(FILE).mtimeMs < TTL_MS;
    if (!fresh) {
      building ??= build().finally(() => { building = null; });
      try { await building; } catch (err) {
        app.log.error({ err }, "log export failed");
        return reply.code(503).send({ error: "The Log export isn't ready. Try again in a minute." });
      }
    }
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="exomusica-log-${day}.zip"`)
      .header("Cache-Control", "no-store")
      .send(createReadStream(FILE));
  });
}
