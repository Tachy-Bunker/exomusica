import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { byYear, dayString, parseMonthDay, sameDay } from "../lib/capsule.js";
import { plainExcerpt } from "../lib/publicChannels.js";

interface ChatYear { count: number; channels: { slug: string; name: string; count: number }[]; highlights: { id: number; author: string; text: string; channelSlug: string; day: string }[] }
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 3_600_000; // the answer for a calendar day only changes when someone imports history, so an hour is plenty

export async function capsuleRoutes(app: FastifyInstance): Promise<void> {
  // "This day in past years": what happened on this month and day in the archive (imported Discord days included).
  app.get<{ Querystring: { md?: string } }>("/api/capsule", async (req, reply) => {
    const now = new Date();
    const md = parseMonthDay(req.query.md, now);
    if (!md) return reply.code(400).send({ error: "md must look like 10-13" });
    const key = `${md.m}-${md.d}-${now.getUTCFullYear()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.body;
    const thisYear = now.getUTCFullYear();

    // Counts per year and room, then up to three readable messages per year. Only rooms the public may read.
    const counts = await prisma.$queryRaw<{ year: number; slug: string; name: string; n: bigint }[]>`
      SELECT EXTRACT(YEAR FROM m."dayKey")::int AS year, c.slug, c.name, COUNT(*) AS n
      FROM "Message" m JOIN "ForumChannel" c ON c.id = m."channelId" LEFT JOIN "Branch" b ON b.id = c."branchId"
      WHERE EXTRACT(MONTH FROM m."dayKey") = ${md.m} AND EXTRACT(DAY FROM m."dayKey") = ${md.d} AND EXTRACT(YEAR FROM m."dayKey") < ${thisYear}
        AND m."isDeleted" = false AND (c."branchId" IS NULL OR b.visibility <> 'HIDDEN')
      GROUP BY 1, c.slug, c.name ORDER BY 1 DESC, n DESC`;
    const picks = await prisma.$queryRaw<{ id: number; year: number; text: string; author: string; slug: string }[]>`
      SELECT id, year, text, author, slug FROM (
        SELECT m.id, EXTRACT(YEAR FROM m."dayKey")::int AS year, m."contentRaw" AS text, u.username AS author, c.slug,
               ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM m."dayKey") ORDER BY LENGTH(m."contentRaw") DESC) AS rn
        FROM "Message" m JOIN "ForumChannel" c ON c.id = m."channelId" LEFT JOIN "Branch" b ON b.id = c."branchId" JOIN "User" u ON u.id = m."authorId"
        WHERE EXTRACT(MONTH FROM m."dayKey") = ${md.m} AND EXTRACT(DAY FROM m."dayKey") = ${md.d} AND EXTRACT(YEAR FROM m."dayKey") < ${thisYear}
          AND m."isDeleted" = false AND m.kind = 'text' AND LENGTH(m."contentRaw") BETWEEN 40 AND 600 AND (c."branchId" IS NULL OR b.visibility <> 'HIDDEN')
      ) t WHERE rn <= 3 ORDER BY year DESC, rn`;

    const chat = new Map<number, ChatYear>();
    for (const r of counts) {
      const y = chat.get(r.year) ?? { count: 0, channels: [], highlights: [] };
      y.count += Number(r.n); if (y.channels.length < 4) y.channels.push({ slug: r.slug, name: r.name, count: Number(r.n) });
      chat.set(r.year, y);
    }
    for (const p of picks) {
      const text = plainExcerpt(p.text, 160);
      if (text) chat.get(p.year)?.highlights.push({ id: p.id, author: p.author, text, channelSlug: p.slug, day: dayString(p.year, md) });
    }

    const [albums, studies] = await Promise.all([
      prisma.album.findMany({ where: { branch: { visibility: { not: "HIDDEN" } } }, select: { slug: true, title: true, composer: true, createdAt: true } }),
      prisma.study.findMany({ select: { slug: true, title: true, createdAt: true, owner: { select: { username: true } } } }),
    ]);
    const body = {
      day: dayString(thisYear, md),
      years: byYear(thisYear,
        albums.filter((a) => sameDay(a.createdAt, md)).map((a) => ({ at: a.createdAt, slug: a.slug, title: a.title, composer: a.composer })),
        studies.filter((s) => sameDay(s.createdAt, md)).map((s) => ({ at: s.createdAt, slug: s.slug, title: s.title, owner: s.owner.username })),
        chat,
      ).map((y) => ({ ...y, albums: y.albums.map(({ at: _a, ...a }) => a), studies: y.studies.map(({ at: _s, ...s }) => s) })),
    };
    cache.set(key, { at: Date.now(), body });
    return body;
  });
}
