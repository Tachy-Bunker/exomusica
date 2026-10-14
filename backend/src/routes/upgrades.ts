import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { cleanChoice, earnedBy, hintLevel, playlistCap, UPGRADES } from "../lib/upgrades.js";
import { getMilestones, publicShape } from "../lib/milestones.js";
import { getFieldLogCatalog } from "./fieldLog.js";

/** Award whatever this member's scans now earn. Returns the titles that are newly theirs. Called after a scan is saved. */
export async function awardUpgrades(userId: number): Promise<string[]> {
  const [sections, rows, held] = await Promise.all([
    getFieldLogCatalog(),
    prisma.probeScan.findMany({ where: { userId }, select: { key: true } }),
    prisma.userUpgrade.findMany({ where: { userId, earnedAt: { not: null } }, select: { key: true } }),
  ]);
  const have = new Set(held.map((h) => h.key));
  const fresh = earnedBy(sections, new Set(rows.map((r) => r.key))).filter((k) => !have.has(k));
  if (fresh.length === 0) return [];
  const now = new Date();
  for (const key of fresh) await prisma.userUpgrade.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, earnedAt: now }, update: { earnedAt: now } });
  await prisma.user.update({ where: { id: userId }, data: { upgradeRetunedAt: now } }); // earning one re-tunes the hints for the rest
  return fresh.map((k) => UPGRADES.find((u) => u.key === k)?.title ?? k);
}

/** What this member may own right now, and what they own. Used by the Suit tab and by playlist creation. */
export async function playlistSlots(userId: number): Promise<{ used: number; cap: number }> {
  const [held, ms, used] = await Promise.all([
    prisma.userUpgrade.findMany({ where: { userId, earnedAt: { not: null } }, select: { key: true } }),
    getMilestones(),
    prisma.playlist.count({ where: { ownerId: userId } }),
  ]);
  return { used, cap: playlistCap(new Set(held.map((h) => h.key)), ms.filter((m) => m.reached && m.live)) };
}

export async function upgradeRoutes(app: FastifyInstance): Promise<void> {
  // The Suit tab. Opening it is what starts a hint's fade, so rows are made here and nowhere else.
  app.get("/api/upgrades", { preHandler: requireAuth }, async (req) => {
    const userId = req.user!.id;
    await prisma.userUpgrade.createMany({ data: UPGRADES.map((u) => ({ userId, key: u.key })), skipDuplicates: true });
    const [ms, slots] = await Promise.all([getMilestones(), playlistSlots(userId)]);
    const [rows, me] = await Promise.all([
      prisma.userUpgrade.findMany({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { upgradeChoice: true, upgradeRetunedAt: true } }),
    ]);
    const now = new Date();
    const by = new Map(rows.map((r) => [r.key, r]));
    return {
      items: UPGRADES.map((u) => {
        const r = by.get(u.key);
        if (r?.earnedAt) return { key: u.key, title: u.title, perk: u.perk, earned: true as const };
        const level = hintLevel(r?.firstSeenAt ?? now, me?.upgradeRetunedAt ?? null, now);
        return { key: u.key, title: u.title, earned: false as const, level, hint: u.hints[level] };
      }),
      choice: me?.upgradeChoice ?? { frame: null, tint: null },
      milestones: ms.filter((m) => m.enabled).map(publicShape),
      slots: { playlists: slots },
    };
  });

  // Just the choice, no side effects: the app reads this on login to apply a tint.
  app.get("/api/upgrades/choice", { preHandler: requireAuth }, async (req) => {
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { upgradeChoice: true } });
    return me?.upgradeChoice ?? { frame: null, tint: null };
  });

  app.put<{ Body: unknown }>("/api/upgrades/choice", { preHandler: requireAuth }, async (req, reply) => {
    const held = await prisma.userUpgrade.findMany({ where: { userId: req.user!.id, earnedAt: { not: null } }, select: { key: true } });
    const reached = (await getMilestones()).filter((m) => m.reached && m.live);
    const choice = cleanChoice(req.body, new Set([...held.map((h) => h.key), ...reached.flatMap((m) => (m.frame ? [m.frame] : []))]));
    if (!choice) return reply.code(400).send({ error: "that perk isn't yours yet" });
    await prisma.user.update({ where: { id: req.user!.id }, data: { upgradeChoice: choice } });
    return choice;
  });
}
