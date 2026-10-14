import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { PUBLIC_CHANNEL_FILTER, isPublicChannel } from "../lib/publicChannels.js";
import { getMilestones } from "../lib/milestones.js";
import { dayKey, echoPick, pickFragment, seededIndex, type Echo } from "../lib/resurface.js";

const OLD_DAYS = 30;
let echoCache: { day: string; echo: Echo | null } | null = null;

async function reached(key: string): Promise<boolean> {
  return !!(await getMilestones()).find((m) => m.key === key)?.reached;
}

export async function resurfaceRoutes(app: FastifyInstance): Promise<void> {
  // Index (milestone m-index): a passage from a random wiki page. One count and a few rows; nothing cached because it is meant to differ.
  app.get("/api/log/fragment", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await reached("m-index"))) return { locked: true, fragment: null };
    const n = await prisma.wikiPage.count();
    if (n === 0) return { locked: false, fragment: null };
    const skip = Math.floor(Math.random() * n);
    const pages = await prisma.wikiPage.findMany({ orderBy: { id: "asc" }, skip, take: 6, select: { slug: true, title: true, contentMarkdown: true } });
    for (const p of pages.sort(() => Math.random() - 0.5)) {
      const text = pickFragment(p.contentMarkdown);
      if (text) return { locked: false, fragment: { text, title: p.title, href: `/wiki/${p.slug}` } };
    }
    return { locked: false, fragment: null };
  });

  // Echo (milestone m-echo): one old public message, the same for everybody all UTC day, so it is computed once a day.
  app.get("/api/echo", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=600");
    if (!(await reached("m-echo"))) return { locked: true, echo: null };
    const day = dayKey(new Date());
    if (echoCache?.day === day) return { locked: false, echo: echoCache.echo };
    const where = { isDeleted: false, kind: "text", createdAt: { lt: new Date(Date.now() - OLD_DAYS * 86_400_000) }, channel: PUBLIC_CHANNEL_FILTER };
    const n = await prisma.message.count({ where });
    let echo: Echo | null = null;
    if (n > 0) {
      const select = { id: true, contentRaw: true, createdAt: true, author: { select: { username: true } }, channel: { select: { slug: true, name: true, branchId: true, branch: { select: { visibility: true } } } } };
      for (const skip of [seededIndex(day, n), 0]) {
        const rows = await prisma.message.findMany({ where, orderBy: { id: "asc" }, skip, take: 40, select });
        echo = echoPick(rows.filter((r) => isPublicChannel(r.channel)).map((r) => ({ id: r.id, contentRaw: r.contentRaw, createdAt: r.createdAt, author: r.author.username, channelSlug: r.channel.slug, channelName: r.channel.name })));
        if (echo) break;
      }
    }
    echoCache = { day, echo };
    return { locked: false, echo };
  });
}
