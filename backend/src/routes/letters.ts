import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, verifyToken, type AuthedUser } from "../lib/auth.js";
import { parseKey } from "../lib/atlas.js";
import { LIMITS, cleanDoc, cleanPos, deliverAtFor, expiryFor } from "../lib/letters.js";
import { describe } from "./atlas.js";

const viewerOf = (h: string | undefined): AuthedUser | null => (h?.startsWith("Bearer ") ? verifyToken(h.slice(7)) : null);
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export async function lettersRoutes(app: FastifyInstance): Promise<void> {
  // Send a letter to a member, or leave a mark on a place. Exactly one of `to` / `at`.
  app.post("/api/letters", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!;
    const b = (req.body ?? {}) as { doc?: unknown; to?: string; at?: string; hours?: unknown; days?: unknown; unsigned?: boolean; x?: unknown; y?: unknown };
    const cleaned = cleanDoc(b.doc);
    if (!cleaned.ok) return reply.code(400).send({ error: cleaned.error });
    if (!!b.to === !!b.at) return reply.code(400).send({ error: "Say who it is for, or where to leave it." });
    const today = dayStart();
    if (b.to) {
      const to = await prisma.user.findUnique({ where: { username: String(b.to).trim() }, select: { id: true, passwordHash: true } });
      if (!to || !to.passwordHash) return reply.code(404).send({ error: "No such member." });
      if (to.id === me.id) return reply.code(400).send({ error: "That one is you." });
      if ((await prisma.letter.count({ where: { authorId: me.id, toUserId: { not: null }, createdAt: { gte: today } } })) >= LIMITS.toUserPerDay) return reply.code(429).send({ error: "That is enough letters for today." });
      // a blocked sender gets the same answer as anyone, so blocking can't be probed
      const blocked = await prisma.letterBlock.findUnique({ where: { blockerId_blockedId: { blockerId: to.id, blockedId: me.id } } });
      if (!blocked) await prisma.letter.create({ data: { authorId: me.id, toUserId: to.id, doc: cleaned.doc as object, deliverAt: deliverAtFor(b.hours) } });
      return reply.code(201).send({ ok: true });
    }
    const key = parseKey(b.at);
    if (!key) return reply.code(400).send({ error: "That is not a place." });
    const placeKey = `${key.type}:${key.id}`;
    if ((await describe([placeKey])).length === 0) return reply.code(404).send({ error: "There is nothing at that place." });
    if ((await prisma.letter.count({ where: { authorId: me.id, entityKey: { not: null }, createdAt: { gte: today } } })) >= LIMITS.marksPerDay) return reply.code(429).send({ error: "You have left enough marks for today." });
    const here = await prisma.letter.count({ where: { entityKey: placeKey, expiresAt: { gt: new Date() } } });
    if (here >= LIMITS.marksPerPlace) return reply.code(409).send({ error: "This place is full of marks. Try again when some have faded." });
    const l = await prisma.letter.create({ data: { authorId: me.id, entityKey: placeKey, doc: cleaned.doc as object, unsigned: !!b.unsigned, expiresAt: expiryFor(b.days), ...(cleanPos(b.x, b.y) ?? {}) } });
    return reply.code(201).send({ ok: true, id: l.id });
  });

  // How many delivered letters you haven't opened. Cheap enough for the faceplate to ask now and then.
  app.get("/api/letters/unread", { preHandler: requireAuth }, async (req) => ({ n: await prisma.letter.count({ where: { toUserId: req.user!.id, openedAt: null, deliverAt: { lte: new Date() } } }) }));

  app.get("/api/letters/inbox", { preHandler: requireAuth }, async (req) => {
    const id = req.user!.id;
    const [got, sent] = await Promise.all([
      prisma.letter.findMany({ where: { toUserId: id, deliverAt: { lte: new Date() } }, orderBy: { deliverAt: "desc" }, take: 60, select: { id: true, openedAt: true, deliverAt: true, author: { select: { username: true } } } }),
      prisma.letter.findMany({ where: { authorId: id, toUserId: { not: null } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, deliverAt: true, openedAt: true, toUser: { select: { username: true } } } }),
    ]);
    const now = Date.now();
    return {
      got: got.map((l) => ({ id: l.id, from: l.author.username, at: l.deliverAt, opened: !!l.openedAt })),
      sent: sent.map((l) => ({ id: l.id, to: l.toUser?.username ?? "", state: l.deliverAt.getTime() > now ? "in the post" : l.openedAt ? "opened" : "delivered", deliverAt: l.deliverAt })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/letters/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!;
    const l = await prisma.letter.findUnique({ where: { id: Number(req.params.id) || 0 }, include: { author: { select: { username: true } } } });
    if (!l) return reply.code(404).send({ error: "no such letter" });
    const mine = l.authorId === me.id;
    const forMe = l.toUserId === me.id && l.deliverAt <= new Date();
    if (!mine && !forMe && !me.isAdmin) return reply.code(404).send({ error: "no such letter" });
    if (forMe && !l.openedAt) await prisma.letter.update({ where: { id: l.id }, data: { openedAt: new Date() } });
    return { id: l.id, doc: l.doc, from: l.author.username, at: l.deliverAt, mine, canBlock: forMe };
  });

  app.delete<{ Params: { id: string } }>("/api/letters/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!;
    const l = await prisma.letter.findUnique({ where: { id: Number(req.params.id) || 0 } });
    if (!l) return reply.code(404).send({ error: "no such letter" });
    if (l.authorId !== me.id && l.toUserId !== me.id && !me.isAdmin) return reply.code(404).send({ error: "no such letter" });
    await prisma.letter.delete({ where: { id: l.id } });
    if (me.isAdmin && l.authorId !== me.id && l.toUserId !== me.id) await prisma.auditLog.create({ data: { actorId: me.id, action: "letter.delete", targetType: "Letter", targetId: l.id, meta: { entityKey: l.entityKey } } });
    return reply.code(204).send();
  });

  // Stop receiving letters from someone. Their sends still "succeed" for them.
  app.post<{ Params: { id: string } }>("/api/letters/:id/block", { preHandler: requireAuth }, async (req, reply) => {
    const l = await prisma.letter.findUnique({ where: { id: Number(req.params.id) || 0 }, select: { authorId: true, toUserId: true } });
    if (!l || l.toUserId !== req.user!.id) return reply.code(404).send({ error: "no such letter" });
    await prisma.letterBlock.upsert({ where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: l.authorId } }, create: { blockerId: req.user!.id, blockedId: l.authorId }, update: {} });
    await prisma.letter.deleteMany({ where: { authorId: l.authorId, toUserId: req.user!.id } });
    return reply.code(204).send();
  });

  // Marks on a place. Only asked for when the Scan Visor is on.
  app.get<{ Querystring: { key?: string } }>("/api/landmarks", async (req, reply) => {
    const viewer = viewerOf(req.headers.authorization);
    const k = parseKey(req.query.key);
    if (!k) return reply.code(400).send({ error: "bad key" });
    const rows = await prisma.letter.findMany({ where: { entityKey: `${k.type}:${k.id}`, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: LIMITS.marksPerPlace, include: { author: { select: { username: true } } } });
    return rows.map((l) => ({ id: l.id, doc: l.doc, by: l.unsigned && !viewer?.isAdmin ? null : l.author.username, mine: viewer?.id === l.authorId, at: l.createdAt, expiresAt: l.expiresAt, x: l.posX, y: l.posY }));
  });
}
