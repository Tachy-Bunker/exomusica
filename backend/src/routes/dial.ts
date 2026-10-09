import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { cleanDial, isEmptyDial } from "../lib/dial.js";

const slugOk = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(s);

export async function dialRoutes(app: FastifyInstance): Promise<void> {
  // The member's dial follows them across devices. Stored as one small JSON blob; always re-cleaned on the way in and out.
  app.get("/api/account/dial", { preHandler: requireAuth }, async (req) => {
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { dialJson: true } });
    const d = cleanDial(me?.dialJson);
    return isEmptyDial(d) ? { dial: null } : { dial: d };
  });

  app.put<{ Body: unknown }>("/api/account/dial", { preHandler: requireAuth, bodyLimit: 16 * 1024 }, async (req) => {
    const d = cleanDial(req.body);
    await prisma.user.update({ where: { id: req.user!.id }, data: { dialJson: d as object } });
    return { dial: d };
  });

  // What the dial's lamps show for the rooms on it: when someone last spoke (and what), how busy the last half hour was, and whether you were
  // mentioned since the last message you saw there. One request for up to 12 rooms; the client asks once a minute, and only while the tab is visible.
  app.get<{ Querystring: { slugs?: string; seen?: string } }>("/api/dial/pulse", { preHandler: requireAuth }, async (req) => {
    const slugs = [...new Set((req.query.slugs ?? "").split(",").map((s) => s.trim()).filter(slugOk))].slice(0, 12);
    if (slugs.length === 0) return {};
    const seen = new Map<string, number>();
    for (const part of (req.query.seen ?? "").split(",")) { const [s, id] = part.split(":"); const n = Number(id); if (s && slugOk(s) && Number.isFinite(n) && n > 0) seen.set(s, n); }
    const me = req.user!.id;
    const channels = await prisma.forumChannel.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const halfHour = new Date(Date.now() - 30 * 60_000), day = new Date(Date.now() - 24 * 3600_000);
    const out: Record<string, { last: number | null; recent: number; mentions: number; line: { by: string; text: string } | null }> = {};
    await Promise.all(channels.map(async (c: { id: number; slug: string }) => {
      const base = { channelId: c.id, isDeleted: false };
      const [last, recent, mentions] = await Promise.all([
        prisma.message.findFirst({ where: base, orderBy: { id: "desc" }, select: { createdAt: true, contentRaw: true, kind: true, author: { select: { username: true } } } }),
        prisma.message.count({ where: { ...base, createdAt: { gte: halfHour } } }),
        prisma.message.count({ where: { ...base, authorId: { not: me }, contentRaw: { contains: `<@${me}>` }, ...(seen.has(c.slug) ? { id: { gt: seen.get(c.slug)! } } : { createdAt: { gte: day } }) } }),
      ]);
      out[c.slug] = {
        last: last ? Math.floor(last.createdAt.getTime() / 1000) : null, recent, mentions,
        line: last ? { by: last.author.username, text: last.kind !== "text" && !last.contentRaw.trim() ? `[${last.kind}]` : last.contentRaw.replace(/\s+/g, " ").trim().slice(0, 90) } : null,
      };
    }));
    return out;
  });
}
