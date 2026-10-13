import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { buildCatalog, type LogSection } from "../lib/fieldLog.js";

// Public data only, the same as the listings it is built from. One cache for everyone: five minutes is plenty for something that changes when an admin writes a page.
let cache: { at: number; sections: LogSection[] } | null = null;
const TTL = 5 * 60_000;

export async function fieldLogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/field-log", async (_req, reply) => {
    if (!cache || Date.now() - cache.at > TTL) {
      const [wiki, studies, branches, phenomena, albums] = await Promise.all([
        prisma.wikiPage.findMany({ select: { slug: true, title: true }, orderBy: { title: "asc" }, take: 400 }),
        prisma.study.findMany({ select: { slug: true, title: true }, orderBy: { createdAt: "asc" }, take: 400 }),
        prisma.branch.findMany({ where: { visibility: "VISIBLE" }, select: { slug: true, name: true }, orderBy: { name: "asc" }, take: 400 }),
        prisma.phenomenon.findMany({ where: { published: true }, select: { slug: true, title: true, body: true, chain: true, exampleTrackId: true }, orderBy: { title: "asc" }, take: 400 }),
        prisma.album.findMany({ where: { branch: { visibility: "VISIBLE" } }, select: { slug: true, title: true }, orderBy: { createdAt: "asc" }, take: 400 }),
      ]);
      cache = { at: Date.now(), sections: buildCatalog({ wiki, studies, branches, phenomena: phenomena.map((p) => ({ slug: p.slug, title: p.title, body: p.body, chain: p.chain, hasExample: p.exampleTrackId != null })), albums }) };
    }
    void reply.header("Cache-Control", "public, max-age=300");
    return cache.sections;
  });
}
