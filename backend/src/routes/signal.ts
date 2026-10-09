import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { makeLimiter } from "../lib/resourceAccess.js";
import { isMediaUrl } from "../lib/chatKinds.js";
import { checkAnswer, dayIndex, hashAnswer, isOnAir, newSalt, stationDate, wouldLoop, type NodeRules } from "../lib/signal.js";

const limiter = makeLimiter(10, 60_000);
const txt = (v: unknown, max: number): string | null => String(v ?? "").trim().slice(0, max) || null;
const siteOrMedia = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s && (isMediaUrl(s) || /^\/[^/\s]\S*$/.test(s)) && s.length <= 500 ? s : null; };

export async function signalRoutes(app: FastifyInstance): Promise<void> {
  // What is on the air for you: the station date, and every transmission whose turn has come.
  app.get("/api/signal", { preHandler: requireAuth }, async (req) => {
    const me = req.user!.id;
    const [nodes, mine, counts] = await Promise.all([
      prisma.puzzleNode.findMany({ where: { published: true }, include: { rewardItem: { select: { id: true, title: true } } }, orderBy: { id: "asc" } }),
      prisma.puzzleSolve.findMany({ where: { userId: me }, select: { nodeId: true } }),
      prisma.puzzleSolve.groupBy({ by: ["nodeId"], _count: { _all: true } }),
    ]);
    const today = dayIndex();
    const byId = new Map<number, NodeRules>(nodes.map((n) => [n.id, { id: n.id, published: n.published, opensOnDay: n.opensOnDay, requires: n.requires, quorum: n.quorum }]));
    const solved = new Set<number>(mine.map((s) => s.nodeId));
    const count = new Map<number, number>(counts.map((c) => [c.nodeId, c._count._all]));
    const on = nodes.filter((n) => isOnAir(byId.get(n.id)!, byId, today, solved, count));
    return {
      today: { index: today, ...stationDate(today) },
      nodes: on.map((n) => ({
        id: n.id, title: n.title, body: n.body, mediaUrl: n.mediaUrl, hint: n.hint,
        hasAnswer: !!n.answerHash, solved: solved.has(n.id), quorum: n.quorum, solveCount: n.quorum > 0 ? count.get(n.id) ?? 0 : null,
        reward: solved.has(n.id) ? { text: n.rewardText, url: n.rewardUrl, points: n.rewardPoints, item: n.rewardItem } : null,
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: { answer?: string } }>("/api/signal/:id/answer", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.user!.id;
    const id = Number(req.params.id) || 0;
    if (!limiter.hit(`${me}:${id}`)) return reply.code(429).send({ error: "Slow down. Try again in a minute." });
    const [nodes, mine, counts] = await Promise.all([
      prisma.puzzleNode.findMany({ where: { published: true }, include: { rewardItem: { select: { id: true, title: true } } } }),
      prisma.puzzleSolve.findMany({ where: { userId: me }, select: { nodeId: true } }),
      prisma.puzzleSolve.groupBy({ by: ["nodeId"], _count: { _all: true } }),
    ]);
    const byId = new Map<number, NodeRules>(nodes.map((n) => [n.id, { id: n.id, published: true, opensOnDay: n.opensOnDay, requires: n.requires, quorum: n.quorum }]));
    const solved = new Set<number>(mine.map((s) => s.nodeId));
    const node = nodes.find((n) => n.id === id);
    // a transmission that isn't on the air for you doesn't exist as far as you can tell
    if (!node || !isOnAir(byId.get(id)!, byId, dayIndex(), solved, new Map<number, number>(counts.map((c) => [c.nodeId, c._count._all])))) return reply.code(404).send({ error: "Nothing on that frequency." });
    if (node.answerHash && node.answerSalt) {
      if (!checkAnswer(node.answerSalt, node.answerHash, String(req.body?.answer ?? ""))) return { correct: false };
    }
    const made = await prisma.puzzleSolve.createMany({ data: [{ nodeId: id, userId: me }], skipDuplicates: true });
    if (made.count === 1) {
      if (node.rewardPoints > 0) await prisma.contributorPointsEntry.create({ data: { userId: me, points: node.rewardPoints, reason: `Signal: ${node.title}`.slice(0, 190) } });
      if (node.rewardItemId) await prisma.resourceUnlock.upsert({ where: { userId_itemId: { userId: me, itemId: node.rewardItemId } }, create: { userId: me, itemId: node.rewardItemId, via: "puzzle" }, update: {} });
    }
    return { correct: true, newly: made.count === 1, reward: { text: node.rewardText, url: node.rewardUrl, points: node.rewardPoints, item: node.rewardItem } };
  });

  // ---- the operator's side
  const adminDto = (n: { id: number; title: string; body: string; mediaUrl: string | null; hint: string | null; answerHash: string | null; requires: number[]; quorum: number; opensOnDay: number | null; rewardText: string | null; rewardUrl: string | null; rewardPoints: number; rewardItemId: number | null; published: boolean; x: number | null; y: number | null }, solveCount: number) =>
    ({ id: n.id, title: n.title, body: n.body, mediaUrl: n.mediaUrl, hint: n.hint, hasAnswer: !!n.answerHash, requires: n.requires, quorum: n.quorum, opensOnDay: n.opensOnDay, opensOn: n.opensOnDay === null ? null : stationDate(n.opensOnDay).label, rewardText: n.rewardText, rewardUrl: n.rewardUrl, rewardPoints: n.rewardPoints, rewardItemId: n.rewardItemId, published: n.published, x: n.x, y: n.y, solveCount });

  app.get("/api/admin/signal", { preHandler: requireAdmin }, async () => {
    const [nodes, counts] = await Promise.all([prisma.puzzleNode.findMany({ orderBy: { id: "asc" } }), prisma.puzzleSolve.groupBy({ by: ["nodeId"], _count: { _all: true } })]);
    const c = new Map<number, number>(counts.map((x) => [x.nodeId, x._count._all]));
    return { today: { index: dayIndex(), ...stationDate(dayIndex()) }, nodes: nodes.map((n) => adminDto(n, c.get(n.id) ?? 0)) };
  });

  /** Reads and checks the editable fields; `partial` keeps whatever isn't sent. */
  async function readBody(b: Record<string, unknown>, selfId: number | null, partial: boolean): Promise<{ data: Record<string, unknown> } | { error: string }> {
    const data: Record<string, unknown> = {};
    const has = (k: string) => b[k] !== undefined;
    if (!partial || has("title")) { const t = txt(b.title, 120); if (!t) return { error: "Give it a title." }; data.title = t; }
    if (!partial || has("body")) { const t = txt(b.body, 8000); if (!t) return { error: "A transmission needs its text." }; data.body = t; }
    if (has("mediaUrl")) { if (b.mediaUrl && !siteOrMedia(b.mediaUrl)) return { error: "The media must be an https link or an /uploads file." }; data.mediaUrl = b.mediaUrl ? siteOrMedia(b.mediaUrl) : null; }
    if (has("hint")) data.hint = txt(b.hint, 600);
    if (has("answer")) {
      const a = String(b.answer ?? "");
      if (a.trim()) { const salt = newSalt(); data.answerSalt = salt; data.answerHash = hashAnswer(salt, a); } else { data.answerSalt = null; data.answerHash = null; }
    }
    if (has("quorum")) { const q = Number(b.quorum); if (!Number.isInteger(q) || q < 0 || q > 10000) return { error: "Quorum is a whole number, 0 for none." }; data.quorum = q; }
    if (has("opensOnDay")) { if (b.opensOnDay === null || b.opensOnDay === "") data.opensOnDay = null; else { const d = Number(b.opensOnDay); if (!Number.isInteger(d) || d < 0 || d > 400000) return { error: "That station date doesn't exist." }; data.opensOnDay = d; } }
    if (has("rewardText")) data.rewardText = txt(b.rewardText, 4000);
    if (has("rewardUrl")) { if (b.rewardUrl && !siteOrMedia(b.rewardUrl)) return { error: "The reward link must be https or a path on this site." }; data.rewardUrl = b.rewardUrl ? siteOrMedia(b.rewardUrl) : null; }
    if (has("rewardPoints")) { const p = Number(b.rewardPoints); if (!Number.isInteger(p) || p < 0 || p > 100) return { error: "Reward points are 0 to 100." }; data.rewardPoints = p; }
    if (has("rewardItemId")) {
      if (b.rewardItemId === null || b.rewardItemId === "") data.rewardItemId = null;
      else { const it = await prisma.sampleBankItem.findUnique({ where: { id: Number(b.rewardItemId) || 0 }, select: { id: true } }); if (!it) return { error: "No such resource to give." }; data.rewardItemId = it.id; }
    }
    if (has("published")) data.published = !!b.published;
    for (const k of ["x", "y"] as const) if (has(k)) data[k] = Number.isFinite(Number(b[k])) ? Number(b[k]) : null;
    if (has("requires")) {
      const r = [...new Set((Array.isArray(b.requires) ? b.requires : []).map(Number).filter((n) => Number.isInteger(n)))];
      const all = await prisma.puzzleNode.findMany({ select: { id: true, requires: true } });
      if (r.some((x) => !all.some((n) => n.id === x))) return { error: "A required transmission doesn't exist." };
      if (selfId !== null && r.includes(selfId)) return { error: "A transmission can't require itself." };
      if (selfId !== null && wouldLoop(selfId, r, all)) return { error: "That would make a loop: it would end up requiring itself." };
      data.requires = r;
    }
    return { data };
  }

  app.post("/api/admin/signal", { preHandler: requireAdmin }, async (req, reply) => {
    const r = await readBody((req.body ?? {}) as Record<string, unknown>, null, false);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const n = await prisma.puzzleNode.create({ data: r.data as never });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "signal.create", targetType: "PuzzleNode", targetId: n.id, meta: { title: n.title } } });
    return reply.code(201).send(adminDto(n, 0));
  });

  app.patch<{ Params: { id: string } }>("/api/admin/signal/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id) || 0;
    if (!(await prisma.puzzleNode.findUnique({ where: { id }, select: { id: true } }))) return reply.code(404).send({ error: "no such transmission" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const r = await readBody(body, id, true);
    if ("error" in r) return reply.code(400).send({ error: r.error });
    const n = await prisma.puzzleNode.update({ where: { id }, data: r.data as never });
    const { answer: _a, ...logged } = body; // the answer itself is never written to the log
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "signal.update", targetType: "PuzzleNode", targetId: id, meta: { ...logged, answerChanged: body.answer !== undefined } as object } });
    return adminDto(n, await prisma.puzzleSolve.count({ where: { nodeId: id } }));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/signal/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id) || 0;
    const n = await prisma.puzzleNode.findUnique({ where: { id } });
    if (!n) return reply.code(404).send({ error: "no such transmission" });
    const dependents = await prisma.puzzleNode.findMany({ where: { requires: { has: id } }, select: { id: true, requires: true } });
    await prisma.$transaction([
      ...dependents.map((d) => prisma.puzzleNode.update({ where: { id: d.id }, data: { requires: d.requires.filter((x) => x !== id) } })),
      prisma.puzzleNode.delete({ where: { id } }),
    ]);
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "signal.delete", targetType: "PuzzleNode", targetId: id, meta: { title: n.title } } });
    return reply.code(204).send();
  });

  // Try an answer without solving anything.
  app.post<{ Params: { id: string }; Body: { answer?: string } }>("/api/admin/signal/:id/test", { preHandler: requireAdmin }, async (req, reply) => {
    const n = await prisma.puzzleNode.findUnique({ where: { id: Number(req.params.id) || 0 }, select: { answerHash: true, answerSalt: true } });
    if (!n) return reply.code(404).send({ error: "no such transmission" });
    return { correct: n.answerHash && n.answerSalt ? checkAnswer(n.answerSalt, n.answerHash, String(req.body?.answer ?? "")) : null };
  });
}
