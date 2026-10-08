import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, verifyToken, type AuthedUser } from "../lib/auth.js";
import { claimProblem, cleanReward } from "../lib/rewards.js";

const viewerOf = (h: string | undefined): AuthedUser | null => (h?.startsWith("Bearer ") ? verifyToken(h.slice(7)) : null);
class Refused extends Error {}

export async function rewardsRoutes(app: FastifyInstance): Promise<void> {
  // What can be bought with points. Anyone may look; the counts of "yours" need a login.
  app.get("/api/rewards", async (req) => {
    const viewer = viewerOf(req.headers.authorization);
    const rewards = await prisma.reward.findMany({ where: { active: true }, include: { item: { select: { id: true, title: true } } }, orderBy: [{ cost: "asc" }, { id: "asc" }] });
    const mine = viewer ? await prisma.rewardClaim.groupBy({ by: ["rewardId"], where: { userId: viewer.id, status: { not: "refunded" } }, _count: { _all: true } }) : [];
    const had = new Map(mine.map((m) => [m.rewardId, m._count._all]));
    return rewards.map((r) => ({ id: r.id, title: r.title, description: r.description, cost: r.cost, stock: r.stock, perUser: r.perUser, itemId: r.itemId, itemTitle: r.item?.title ?? null, mine: had.get(r.id) ?? 0 }));
  });

  // A member's own points: the balance, what earned and spent it, and what they have claimed.
  app.get("/api/account/points", { preHandler: requireAuth }, async (req) => {
    const userId = req.user!.id;
    const [sum, entries, claims] = await Promise.all([
      prisma.contributorPointsEntry.aggregate({ where: { userId }, _sum: { points: true } }),
      prisma.contributorPointsEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, points: true, reason: true, createdAt: true } }),
      prisma.rewardClaim.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, cost: true, status: true, note: true, createdAt: true, reward: { select: { title: true, itemId: true } } } }),
    ]);
    return { balance: sum._sum.points ?? 0, entries, claims: claims.map((c) => ({ id: c.id, title: c.reward.title, itemId: c.reward.itemId, cost: c.cost, status: c.status, note: c.note, createdAt: c.createdAt })) };
  });

  app.post<{ Params: { id: string } }>("/api/rewards/:id/claim", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.id;
    const rewardId = Number(req.params.id);
    if (!Number.isInteger(rewardId)) return reply.code(404).send({ error: "no such reward" });
    try {
      const out = await prisma.$transaction(async (tx) => {
        // one claim at a time per member, so two quick clicks can't spend the same points twice
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;
        const reward = await tx.reward.findUnique({ where: { id: rewardId }, include: { item: { select: { id: true, paid: true, attachment: { select: { storagePath: true, filename: true } } } } } });
        if (!reward) throw new Refused("no such reward");
        const [sum, had] = await Promise.all([
          tx.contributorPointsEntry.aggregate({ where: { userId }, _sum: { points: true } }),
          tx.rewardClaim.count({ where: { userId, rewardId, status: { not: "refunded" } } }),
        ]);
        const problem = claimProblem(reward, sum._sum.points ?? 0, had);
        if (problem) throw new Refused(problem);
        if (reward.stock !== null) {
          const took = await tx.reward.updateMany({ where: { id: rewardId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
          if (took.count === 0) throw new Refused("That reward has run out.");
        }
        const entry = await tx.contributorPointsEntry.create({ data: { userId, points: -reward.cost, reason: `Reward: ${reward.title}` } });
        const opens = !!reward.item?.paid;
        await tx.rewardClaim.create({ data: { userId, rewardId, cost: reward.cost, entryId: entry.id, status: opens ? "fulfilled" : "pending", fulfilledAt: opens ? new Date() : null } });
        if (opens) await tx.resourceUnlock.upsert({ where: { userId_itemId: { userId, itemId: reward.item!.id } }, create: { userId, itemId: reward.item!.id, via: "points" }, update: {} });
        return { opens, balance: (sum._sum.points ?? 0) - reward.cost, file: opens ? reward.item!.attachment : null, itemId: reward.itemId };
      });
      return { ok: true, balance: out.balance, opened: out.opens, itemId: out.itemId, fileUrl: out.file?.storagePath ?? null, filename: out.file?.filename ?? null };
    } catch (e) {
      if (e instanceof Refused) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // --- Admin ---------------------------------------------------------------
  app.get("/api/admin/rewards", { preHandler: requireAdmin }, async () => {
    const rewards = await prisma.reward.findMany({ include: { item: { select: { id: true, title: true } }, _count: { select: { claims: true } } }, orderBy: { createdAt: "desc" } });
    return rewards.map((r) => ({ id: r.id, title: r.title, description: r.description, cost: r.cost, perUser: r.perUser, stock: r.stock, active: r.active, itemId: r.itemId, itemTitle: r.item?.title ?? null, claimCount: r._count.claims }));
  });

  app.post<{ Body: Record<string, unknown> }>("/api/admin/rewards", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const c = cleanReward(b);
    if (!c.ok) return reply.code(400).send({ error: c.error });
    let itemId: number | null = null;
    if (b.itemId !== undefined && b.itemId !== null && b.itemId !== "") {
      itemId = Number(b.itemId);
      const item = Number.isInteger(itemId) ? await prisma.sampleBankItem.findUnique({ where: { id: itemId }, select: { paid: true } }) : null;
      if (!item) return reply.code(400).send({ error: "no such resource" });
      if (!item.paid) return reply.code(400).send({ error: "That resource is free, so there is nothing to unlock. Mark it paid first." });
    }
    const r = await prisma.reward.create({ data: { title: c.data.title!, description: c.data.description ?? null, cost: c.data.cost!, perUser: c.data.perUser ?? 1, stock: c.data.stock ?? null, itemId } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "reward.create", targetType: "Reward", targetId: r.id, meta: { title: r.title, cost: r.cost } } });
    return reply.code(201).send(r);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/rewards/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const c = cleanReward(b, true);
    if (!c.ok) return reply.code(400).send({ error: c.error });
    const data: Record<string, unknown> = { ...c.data };
    if (b.active !== undefined) data.active = b.active === true;
    const r = await prisma.reward.update({ where: { id: Number(req.params.id) }, data });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "reward.update", targetType: "Reward", targetId: r.id, meta: b as object } });
    return r;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/rewards/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    if (await prisma.rewardClaim.count({ where: { rewardId: id, status: { not: "refunded" } } })) return reply.code(409).send({ error: "People have claimed this. Switch it off instead of deleting it." });
    await prisma.reward.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { status?: string } }>("/api/admin/reward-claims", { preHandler: requireAdmin }, async (req) => {
    const claims = await prisma.rewardClaim.findMany({
      where: req.query.status ? { status: req.query.status } : undefined,
      include: { user: { select: { username: true } }, reward: { select: { title: true, itemId: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });
    return claims.map((c) => ({ id: c.id, username: c.user.username, title: c.reward.title, itemId: c.reward.itemId, cost: c.cost, status: c.status, note: c.note, createdAt: c.createdAt, fulfilledAt: c.fulfilledAt }));
  });

  // The team marks a claim done (with a note for the member), or gives the points back.
  app.patch<{ Params: { id: string }; Body: { status?: string; note?: string | null } }>("/api/admin/reward-claims/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (status !== "fulfilled" && status !== "refunded") return reply.code(400).send({ error: "status must be fulfilled or refunded" });
    const note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;
    try {
      const out = await prisma.$transaction(async (tx) => {
        const claim = await tx.rewardClaim.findUnique({ where: { id }, include: { reward: { select: { title: true, itemId: true, stock: true } } } });
        if (!claim) throw new Refused("no such claim");
        if (claim.status === "refunded") throw new Refused("That claim was already refunded.");
        if (status === "fulfilled") return tx.rewardClaim.update({ where: { id }, data: { status: "fulfilled", fulfilledAt: new Date(), note } });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${claim.userId})`;
        await tx.contributorPointsEntry.create({ data: { userId: claim.userId, points: claim.cost, reason: `Refund: ${claim.reward.title}`, awardedById: req.user!.id } });
        if (claim.reward.stock !== null) await tx.reward.update({ where: { id: claim.rewardId }, data: { stock: { increment: 1 } } });
        if (claim.reward.itemId) await tx.resourceUnlock.deleteMany({ where: { userId: claim.userId, itemId: claim.reward.itemId, via: "points" } });
        return tx.rewardClaim.update({ where: { id }, data: { status: "refunded", note } });
      });
      await prisma.auditLog.create({ data: { actorId: req.user!.id, action: `reward.claim.${status}`, targetType: "RewardClaim", targetId: id, meta: { note } } });
      return out;
    } catch (e) {
      if (e instanceof Refused) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // A resource given to one member outright (an artist's own copy, a thank-you).
  app.post<{ Params: { id: string }; Body: { username?: string } }>("/api/admin/resources/:id/grant", { preHandler: requireAdmin }, async (req, reply) => {
    const itemId = Number(req.params.id);
    const user = req.body?.username ? await prisma.user.findFirst({ where: { username: { equals: String(req.body.username).replace(/^@/, "").trim(), mode: "insensitive" } }, select: { id: true, username: true } }) : null;
    if (!user) return reply.code(404).send({ error: "no member with that name" });
    if (!(await prisma.sampleBankItem.findUnique({ where: { id: itemId }, select: { id: true } }))) return reply.code(404).send({ error: "no such resource" });
    await prisma.resourceUnlock.upsert({ where: { userId_itemId: { userId: user.id, itemId } }, create: { userId: user.id, itemId, via: "gift" }, update: {} });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "resource.grant", targetType: "SampleBankItem", targetId: itemId, meta: { to: user.username } } });
    return { ok: true, username: user.username };
  });
}

