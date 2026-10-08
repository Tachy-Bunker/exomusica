import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, verifyToken, type AuthedUser } from "../lib/auth.js";
import { makeLimiter } from "../lib/resourceAccess.js";
import { isPreviewLink } from "../lib/rewards.js";
import { deleteAttachmentAndReclaim, saveSampleBankFile } from "../lib/storage.js";
import { AUTHOR_BONUS, DAILY_TRIAL_POINTS, MIN_FOR_BONUS, RESOLVED, STATUSES, cleanHypothesis, cleanNote, normalisePick, suggestStatus, tally, type HypStatus } from "../lib/hypotheses.js";

const viewerOf = (h: string | undefined): AuthedUser | null => (h?.startsWith("Bearer ") ? verifyToken(h.slice(7)) : null);
const trialLimiter = makeLimiter(60, 60_000);
const STIMULUS_MAX = 10 * 1024 * 1024;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Who is answering: a member, or an anonymous browser token that is only ever stored as a hash. */
function whoOf(viewer: AuthedUser | null, token: unknown): string | null {
  if (viewer) return `u:${viewer.id}`;
  if (typeof token === "string" && TOKEN.test(token)) return "p:" + createHash("sha256").update(token).digest("hex");
  return null;
}

type Row = { id: number; title: string; claim: string; status: string; requirements: string[]; question: string | null; stimulusAUrl: string | null; stimulusBUrl: string | null; authorId: number; author: { username: string }; updatedAt: Date; study?: { slug: string; title: string } | null };
const hasStimuli = (h: { stimulusAUrl: string | null; stimulusBUrl: string | null }) => !!(h.stimulusAUrl && h.stimulusBUrl);

export async function hypothesesRoutes(app: FastifyInstance): Promise<void> {
  const picksFor = async (ids: number[]) => {
    const rows = ids.length ? await prisma.trial.groupBy({ by: ["hypothesisId", "pick"], where: { hypothesisId: { in: ids } }, _count: { _all: true } }) : [];
    const m = new Map<number, string[]>();
    for (const r of rows) { const a = m.get(r.hypothesisId) ?? []; for (let i = 0; i < r._count._all; i++) a.push(r.pick); m.set(r.hypothesisId, a); }
    return m;
  };
  const answeredSet = async (who: string | null, ids: number[]) => who && ids.length ? new Set((await prisma.trial.findMany({ where: { who, hypothesisId: { in: ids } }, select: { hypothesisId: true } })).map((t) => t.hypothesisId)) : new Set<number>();
  // A blind test keeps its tally to itself until you have answered (or wrote it), so the numbers can't steer the answer.
  const card = (h: Row, picks: string[], answered: boolean, viewer: AuthedUser | null) => {
    const t = tally(picks);
    const blind = hasStimuli(h) && !answered && viewer?.id !== h.authorId && !viewer?.isAdmin;
    return { id: h.id, title: h.title, claim: h.claim, status: h.status, requirements: h.requirements, author: h.author.username, testable: hasStimuli(h), n: t.n, tally: blind ? null : t, answered, updatedAt: h.updatedAt };
  };

  app.get<{ Querystring: { status?: string } }>("/api/hypotheses", async (req) => {
    const viewer = viewerOf(req.headers.authorization);
    const status = (STATUSES as readonly string[]).includes(req.query.status ?? "") ? req.query.status : undefined;
    const rows = await prisma.hypothesis.findMany({ where: status ? { status } : undefined, include: { author: { select: { username: true } } }, orderBy: { updatedAt: "desc" }, take: 200 });
    const ids = rows.map((r) => r.id);
    const [picks, done] = await Promise.all([picksFor(ids), answeredSet(viewer ? `u:${viewer.id}` : null, ids)]);
    return rows.map((r) => card(r, picks.get(r.id) ?? [], done.has(r.id), viewer));
  });

  // "Draw one": something open or being tested that you haven't answered, not yours. Anonymous participants pass their token.
  app.get<{ Querystring: { token?: string } }>("/api/hypotheses/draw", async (req, reply) => {
    const viewer = viewerOf(req.headers.authorization);
    const who = whoOf(viewer, req.query.token);
    const where = { status: { in: ["open", "testing"] }, ...(viewer ? { authorId: { not: viewer.id } } : {}), ...(who ? { trials: { none: { who } } } : {}) };
    const count = await prisma.hypothesis.count({ where });
    if (!count) return reply.code(204).send();
    const h = await prisma.hypothesis.findFirst({ where, skip: Math.floor(Math.random() * count), orderBy: { id: "asc" }, select: { id: true } });
    return h ? { id: h.id } : reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/api/hypotheses/:id", async (req, reply) => {
    const viewer = viewerOf(req.headers.authorization);
    const token = (req.query as { token?: string }).token;
    const h = await prisma.hypothesis.findUnique({ where: { id: Number(req.params.id) || 0 }, include: { author: { select: { username: true } }, study: { select: { slug: true, title: true } } } });
    if (!h) return reply.code(404).send({ error: "no such hypothesis" });
    const who = whoOf(viewer, token);
    const [picks, done, mine] = await Promise.all([picksFor([h.id]), answeredSet(who, [h.id]), who ? prisma.trial.findUnique({ where: { hypothesisId_who: { hypothesisId: h.id, who } }, select: { pick: true, note: true } }) : null]);
    const c = card(h, picks.get(h.id) ?? [], done.has(h.id), viewer);
    const isAuthor = viewer?.id === h.authorId;
    const notes = isAuthor || viewer?.isAdmin || c.tally ? (await prisma.trial.findMany({ where: { hypothesisId: h.id, note: { not: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { note: true, pick: true, createdAt: true, user: { select: { username: true } } } })).map((n) => ({ note: n.note, pick: n.pick, by: n.user?.username ?? null, createdAt: n.createdAt })) : [];
    return {
      ...c, protocol: h.protocol, question: h.question, statusNote: h.statusNote, study: h.study,
      stimulusA: h.stimulusAUrl, stimulusB: h.stimulusBUrl,
      suggested: c.tally ? suggestStatus(c.tally) : null, canEdit: isAuthor || !!viewer?.isAdmin, isAuthor,
      mine: mine ? { pick: mine.pick } : null, notes,
    };
  });

  // Create. Multipart so a test can bring its two clips (A is what the claim predicts the answer to be).
  app.post("/api/hypotheses", { preHandler: requireAuth }, async (req, reply) => {
    const f: Record<string, string> = {};
    const files: Record<string, { filename: string; mimetype: string; buffer: Buffer }> = {};
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "field") { f[part.fieldname] = String(part.value ?? ""); continue; }
        if (part.fieldname === "a" || part.fieldname === "b") files[part.fieldname] = { filename: part.filename, mimetype: part.mimetype, buffer: await part.toBuffer() };
      }
    } else Object.assign(f, req.body as Record<string, string>);
    const cleaned = cleanHypothesis(f);
    if (!cleaned.ok) return reply.code(400).send({ error: cleaned.error });
    const links = { a: f.aLink?.trim() || null, b: f.bLink?.trim() || null };
    const wantsAB = !!(files.a || files.b || links.a || links.b);
    if (wantsAB) {
      if (!(files.a || links.a) || !(files.b || links.b)) return reply.code(400).send({ error: "An A/B test needs both clips, A and B." });
      if (!cleaned.v.question) return reply.code(400).send({ error: "Add the one-tap question, e.g. \"Which sounds brighter?\"." });
      for (const k of ["a", "b"] as const) if (!files[k] && !isPreviewLink(links[k])) return reply.code(400).send({ error: `Clip ${k.toUpperCase()}: use an audio file or an https link.` });
      for (const k of ["a", "b"] as const) {
        const file = files[k];
        if (file && !file.mimetype.startsWith("audio/")) return reply.code(400).send({ error: `Clip ${k.toUpperCase()} must be audio.` });
        if (file && file.buffer.length > STIMULUS_MAX) return reply.code(400).send({ error: `Clip ${k.toUpperCase()} is over 10 MB: a test clip should be short.` });
      }
    }
    const saved: { id: number; storagePath: string }[] = [];
    try {
      for (const k of ["a", "b"] as const) { const file = files[k]; if (file) saved.push(await saveSampleBankFile(req.user!.id, file.filename, file.mimetype, file.buffer)); }
    } catch (err) {
      for (const s of saved) await deleteAttachmentAndReclaim(s.id).catch(() => {});
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
    let si = 0;
    const att = { a: files.a ? saved[si++] : null, b: files.b ? saved[si++] : null };
    const h = await prisma.hypothesis.create({
      data: {
        authorId: req.user!.id, ...cleaned.v,
        stimulusAUrl: wantsAB ? att.a?.storagePath ?? links.a : null, stimulusBUrl: wantsAB ? att.b?.storagePath ?? links.b : null,
        stimulusAAttachmentId: att.a?.id ?? null, stimulusBAttachmentId: att.b?.id ?? null,
      },
    });
    return reply.code(201).send({ id: h.id });
  });

  // The author (or an admin) edits the words and sets what it means. The clips stay as they are: changing them would change what the answers were about.
  app.patch<{ Params: { id: string } }>("/api/hypotheses/:id", { preHandler: requireAuth }, async (req, reply) => {
    const h = await prisma.hypothesis.findUnique({ where: { id: Number(req.params.id) || 0 } });
    if (!h) return reply.code(404).send({ error: "no such hypothesis" });
    if (h.authorId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not yours" });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.title !== undefined || b.claim !== undefined || b.protocol !== undefined || b.requirements !== undefined) {
      const c = cleanHypothesis({ title: b.title ?? h.title, claim: b.claim ?? h.claim, protocol: b.protocol ?? h.protocol, requirements: b.requirements ?? h.requirements, question: h.question });
      if (!c.ok) return reply.code(400).send({ error: c.error });
      Object.assign(data, { title: c.v.title, claim: c.v.claim, protocol: c.v.protocol, requirements: c.v.requirements });
    }
    if (b.status !== undefined) {
      if (!(STATUSES as readonly string[]).includes(String(b.status))) return reply.code(400).send({ error: "unknown status" });
      data.status = b.status;
    }
    if (b.statusNote !== undefined) data.statusNote = String(b.statusNote ?? "").trim().slice(0, 600) || null;
    if (b.studyId !== undefined) {
      if (b.studyId === null || b.studyId === "") data.studyId = null;
      else {
        const s = await prisma.study.findUnique({ where: { slug: String(b.studyId) }, select: { id: true, ownerId: true } });
        if (!s) return reply.code(400).send({ error: "no such study" });
        if (s.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "link one of your own studies" });
        data.studyId = s.id;
      }
    }
    const updated = await prisma.hypothesis.update({ where: { id: h.id }, data });
    // a settled test, backed by enough answers from others, earns its author a bonus, once
    if (data.status && RESOLVED.includes(updated.status as HypStatus) && !updated.bonusPaid) {
      const t = tally((await prisma.trial.findMany({ where: { hypothesisId: h.id }, select: { pick: true } })).map((x) => x.pick));
      if (t.informative >= MIN_FOR_BONUS) {
        await prisma.$transaction([
          prisma.hypothesis.update({ where: { id: h.id }, data: { bonusPaid: true } }),
          prisma.contributorPointsEntry.create({ data: { userId: h.authorId, points: AUTHOR_BONUS, reason: `Hypothesis settled: ${updated.title}`.slice(0, 190) } }),
        ]);
      }
    }
    return { status: "ok" };
  });

  app.delete<{ Params: { id: string } }>("/api/hypotheses/:id", { preHandler: requireAuth }, async (req, reply) => {
    const h = await prisma.hypothesis.findUnique({ where: { id: Number(req.params.id) || 0 } });
    if (!h) return reply.code(404).send({ error: "no such hypothesis" });
    if (h.authorId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not yours" });
    await prisma.hypothesis.delete({ where: { id: h.id } });
    for (const id of [h.stimulusAAttachmentId, h.stimulusBAttachmentId]) if (id) await deleteAttachmentAndReclaim(id).catch(() => {});
    if (req.user!.id !== h.authorId) await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "hypothesis.delete", targetType: "Hypothesis", targetId: h.id, meta: { title: h.title } } });
    return reply.code(204).send();
  });

  // One tap. Members and anonymous participants alike; one answer per participant per hypothesis.
  app.post<{ Params: { id: string } }>("/api/hypotheses/:id/trials", async (req, reply) => {
    const viewer = viewerOf(req.headers.authorization);
    if (!trialLimiter.hit(req.ip)) return reply.code(429).send({ error: "Slow down a little." });
    const b = (req.body ?? {}) as { pick?: string; swapped?: boolean; token?: string; note?: string };
    const who = whoOf(viewer, b.token);
    if (!who) return reply.code(400).send({ error: "no participant token" });
    const pick = normalisePick(String(b.pick ?? ""), !!b.swapped);
    if (!pick) return reply.code(400).send({ error: "unknown answer" });
    const h = await prisma.hypothesis.findUnique({ where: { id: Number(req.params.id) || 0 }, select: { id: true, title: true, authorId: true, status: true, stimulusAUrl: true, stimulusBUrl: true } });
    if (!h) return reply.code(404).send({ error: "no such hypothesis" });
    if (viewer?.id === h.authorId) return reply.code(409).send({ error: "You wrote this one: the answers are for everyone else." });
    if (h.status !== "open" && h.status !== "testing") return reply.code(409).send({ error: "This one is settled, so it no longer takes answers." });
    try {
      await prisma.trial.create({ data: { hypothesisId: h.id, userId: viewer?.id ?? null, who, pick, note: cleanNote(b.note) } });
    } catch { return reply.code(409).send({ error: "You already answered this one." }); }
    if (h.status === "open") await prisma.hypothesis.updateMany({ where: { id: h.id, status: "open" }, data: { status: "testing" } });
    let earned = 0;
    if (viewer) {
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      const today = await prisma.contributorPointsEntry.count({ where: { userId: viewer.id, reason: { startsWith: "Trial:" }, createdAt: { gte: day } } });
      if (today < DAILY_TRIAL_POINTS) { await prisma.contributorPointsEntry.create({ data: { userId: viewer.id, points: 1, reason: `Trial: ${h.title}`.slice(0, 190) } }); earned = 1; }
    }
    const picks = await picksFor([h.id]);
    return { ok: true, earned, tally: tally(picks.get(h.id) ?? []) };
  });
}
