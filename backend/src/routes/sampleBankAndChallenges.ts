import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, verifyToken, type AuthedUser } from "../lib/auth.js";
import { canHaveFile, couponProblem, generateCode, isValidCode, makeLimiter, normalizeCode } from "../lib/resourceAccess.js";
import { deleteAttachmentAndReclaim, saveCommunityAlbumCover, saveSampleBankFile } from "../lib/storage.js";

function kindFromMime(mimeType: string): "AUDIO" | "PATCH" | "SCRIPT" | "OTHER" {
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.includes("json") || mimeType.includes("xml")) return "PATCH";
  if (mimeType.startsWith("text/")) return "SCRIPT";
  return "OTHER";
}

const redeemLimiter = makeLimiter(8, 10 * 60 * 1000); // guessing codes: 8 tries per 10 minutes per person / address
const cleanText = (v: unknown, max: number): string | null | undefined => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : typeof v === "string" ? v.trim().slice(0, max) : undefined);
const cleanUrl = (v: unknown): string | null | undefined => {
  const t = cleanText(v, 1000);
  if (t === undefined || t === null) return t;
  return /^(https?:\/\/|\/uploads\/)\S+$/i.test(t) ? t : undefined;
};
function viewerOf(header: string | undefined): AuthedUser | null {
  return header?.startsWith("Bearer ") ? verifyToken(header.slice(7)) : null;
}

export async function sampleBankAndChallengesRoutes(app: FastifyInstance): Promise<void> {
  // --- Sample bank ----------------------------------------------------------

  app.get<{ Querystring: { tag?: string } }>("/api/sample-bank", async (req) => {
    const viewer = viewerOf(req.headers.authorization);
    const items = await prisma.sampleBankItem.findMany({
      where: req.query.tag ? { tags: { has: req.query.tag } } : undefined,
      include: { owner: { select: { username: true } }, attachment: { select: { storagePath: true, filename: true } } },
      orderBy: { createdAt: "desc" },
    });
    const unlocked = new Set(viewer ? (await prisma.resourceUnlock.findMany({ where: { userId: viewer.id }, select: { itemId: true } })).map((u) => u.itemId) : []);
    return items.map((i) => {
      const open = canHaveFile(i, viewer, unlocked.has(i.id));
      return {
      id: i.id,
      title: i.title,
      description: i.description,
      tags: i.tags,
      kind: i.kind,
      fileUrl: open ? i.attachment.storagePath : null, // a locked resource's file address is not sent at all
      filename: i.attachment.filename,
      paid: i.paid,
      locked: !open,
      price: i.price,
      payNote: i.payNote,
      paypalUrl: i.paypalUrl,
      owner: i.owner.username,
      cover: i.imageUrls[0] ?? null,
      gallery: i.imageUrls.slice(1),
      createdAt: i.createdAt,
      };
    });
  });

  // A coupon opens a paid resource. Members keep it unlocked; a visitor just gets the file this once.
  app.post<{ Params: { id: string }; Body: { code?: string } }>("/api/sample-bank/:id/redeem", async (req, reply) => {
    const viewer = viewerOf(req.headers.authorization);
    if (!redeemLimiter.hit(viewer ? `u${viewer.id}` : `ip${req.ip}`)) return reply.code(429).send({ error: "Too many tries. Wait a few minutes and try again." });
    const item = await prisma.sampleBankItem.findUnique({ where: { id: Number(req.params.id) }, include: { attachment: { select: { storagePath: true, filename: true } } } });
    if (!item) return reply.code(404).send({ error: "no such resource" });
    if (!item.paid) return reply.send({ fileUrl: item.attachment.storagePath, filename: item.attachment.filename });
    const code = normalizeCode(req.body?.code);
    const coupon = code ? await prisma.resourceCoupon.findUnique({ where: { code } }) : null;
    if (!coupon) return reply.code(400).send({ error: "That code isn't valid." });
    const problem = couponProblem(coupon, item.id);
    if (problem) return reply.code(400).send({ error: problem });
    const already = viewer ? await prisma.resourceUnlock.findUnique({ where: { userId_itemId: { userId: viewer.id, itemId: item.id } } }) : null;
    if (!already) {
      // count the use only if one is still left (two people redeeming the last use at once can't both succeed)
      const used = await prisma.resourceCoupon.updateMany({ where: { id: coupon.id, ...(coupon.maxUses !== null ? { uses: { lt: coupon.maxUses } } : {}) }, data: { uses: { increment: 1 } } });
      if (used.count === 0) return reply.code(400).send({ error: "That code has been used up." });
      if (viewer) await prisma.resourceUnlock.create({ data: { userId: viewer.id, itemId: item.id, couponId: coupon.id } }).catch(() => {});
    }
    return reply.send({ fileUrl: item.attachment.storagePath, filename: item.attachment.filename, kept: !!viewer });
  });

  // --- Admin: pricing, SEO and coupons of resources -------------------------

  app.get("/api/admin/resources", { preHandler: requireAdmin }, async () => {
    const items = await prisma.sampleBankItem.findMany({ include: { owner: { select: { username: true } }, _count: { select: { coupons: true, unlocks: true } } }, orderBy: { createdAt: "desc" } });
    return items.map((i) => ({ id: i.id, title: i.title, description: i.description, owner: i.owner.username, kind: i.kind, cover: i.imageUrls[0] ?? null, paid: i.paid, price: i.price, payNote: i.payNote, paypalUrl: i.paypalUrl, ogTitle: i.ogTitle, ogDescription: i.ogDescription, ogImageUrl: i.ogImageUrl, couponCount: i._count.coupons, unlockCount: i._count.unlocks }));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/resources/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.paid !== undefined) data.paid = b.paid === true;
    for (const [key, max] of [["price", 60], ["payNote", 2000], ["ogTitle", 200], ["ogDescription", 400]] as const) {
      const v = cleanText(b[key], max);
      if (v !== undefined) data[key] = v;
    }
    for (const key of ["paypalUrl", "ogImageUrl"] as const) {
      if (b[key] === undefined) continue;
      const v = cleanUrl(b[key]);
      if (v === undefined) return reply.code(400).send({ error: `${key} must be a web address (https://...)` });
      data[key] = v;
    }
    const item = await prisma.sampleBankItem.update({ where: { id: Number(req.params.id) }, data });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "resource.update", targetType: "SampleBankItem", targetId: item.id, meta: b as object } });
    return item;
  });

  app.get("/api/admin/resource-coupons", { preHandler: requireAdmin }, async () => {
    const coupons = await prisma.resourceCoupon.findMany({ include: { item: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
    return coupons.map((c) => ({ id: c.id, code: c.code, itemId: c.itemId, itemTitle: c.item?.title ?? null, note: c.note, maxUses: c.maxUses, uses: c.uses, expiresAt: c.expiresAt, active: c.active, createdAt: c.createdAt }));
  });

  app.post<{ Body: { code?: string; itemId?: number | null; note?: string; maxUses?: number | null; expiresAt?: string | null } }>("/api/admin/resource-coupons", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const code = b.code ? normalizeCode(b.code) : generateCode();
    if (!isValidCode(code)) return reply.code(400).send({ error: "A code is 4-32 letters, digits, - or _." });
    if (b.itemId != null && !(await prisma.sampleBankItem.findUnique({ where: { id: Number(b.itemId) }, select: { id: true } }))) return reply.code(400).send({ error: "no such resource" });
    const maxUses = b.maxUses == null || b.maxUses === ("" as unknown) ? null : Math.floor(Number(b.maxUses));
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) return reply.code(400).send({ error: "uses must be 1 or more (or blank for unlimited)" });
    const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return reply.code(400).send({ error: "that expiry date isn't a date" });
    try {
      const c = await prisma.resourceCoupon.create({ data: { code, itemId: b.itemId == null ? null : Number(b.itemId), note: cleanText(b.note, 200) ?? null, maxUses, expiresAt } });
      return reply.code(201).send(c);
    } catch {
      return reply.code(409).send({ error: "That code already exists." });
    }
  });

  app.patch<{ Params: { id: string }; Body: { active?: boolean; note?: string | null; maxUses?: number | null; expiresAt?: string | null } }>("/api/admin/resource-coupons/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.active !== undefined) data.active = b.active === true;
    if (b.note !== undefined) data.note = cleanText(b.note, 200) ?? null;
    if (b.maxUses !== undefined) { const n = b.maxUses === null ? null : Math.floor(Number(b.maxUses)); if (n !== null && (!Number.isFinite(n) || n < 1)) return reply.code(400).send({ error: "uses must be 1 or more" }); data.maxUses = n; }
    if (b.expiresAt !== undefined) { const d = b.expiresAt ? new Date(b.expiresAt) : null; if (d && Number.isNaN(d.getTime())) return reply.code(400).send({ error: "that expiry date isn't a date" }); data.expiresAt = d; }
    return prisma.resourceCoupon.update({ where: { id: Number(req.params.id) }, data });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/resource-coupons/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.resourceCoupon.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  app.post("/api/sample-bank", { preHandler: requireAuth }, async (req, reply) => {
    // Fields and files arrive in any order: the sound itself ("file"), an optional "cover" image and up to three "gallery" images.
    const fields: Record<string, string> = {};
    let sound: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    let cover: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    const gallery: { filename: string; mimetype: string; buffer: Buffer }[] = [];
    for await (const part of req.parts()) {
      if (part.type === "field") { fields[part.fieldname] = String(part.value ?? ""); continue; }
      const buffer = await part.toBuffer();
      const entry = { filename: part.filename, mimetype: part.mimetype, buffer };
      if (part.fieldname === "file") sound = entry;
      else if (part.fieldname === "cover") cover = entry;
      else if (part.fieldname === "gallery") { if (gallery.length < 3) gallery.push(entry); }
    }
    if (!sound) return reply.code(400).send({ error: "no file uploaded" });
    const title = fields.title?.trim();
    if (!title) return reply.code(400).send({ error: "title is required" });
    const description = fields.description?.trim() || null;
    const tags = (fields.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    const savedImages: { id: number; url: string }[] = [];
    let attachment;
    try {
      attachment = await saveSampleBankFile(req.user!.id, sound.filename, sound.mimetype, sound.buffer);
      for (const img of [...(cover ? [cover] : []), ...gallery]) {
        const a = await saveCommunityAlbumCover(req.user!.id, img.filename, img.mimetype, img.buffer);
        savedImages.push({ id: a.id, url: a.storagePath });
      }
    } catch (err) {
      for (const img of savedImages) await deleteAttachmentAndReclaim(img.id).catch(() => {});
      if (attachment) await deleteAttachmentAndReclaim(attachment.id).catch(() => {});
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
    const item = await prisma.sampleBankItem.create({
      data: { ownerId: req.user!.id, title, description, tags, kind: kindFromMime(sound.mimetype), attachmentId: attachment.id, imageUrls: savedImages.map((i) => i.url), imageAttachmentIds: savedImages.map((i) => i.id) },
    });
    return reply.code(201).send(item);
  });

  app.delete<{ Params: { id: string } }>("/api/sample-bank/:id", { preHandler: requireAuth }, async (req, reply) => {
    const item = await prisma.sampleBankItem.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return reply.code(404).send({ error: "no such item" });
    if (item.ownerId !== req.user!.id) return reply.code(403).send({ error: "not yours" });
    await prisma.sampleBankItem.delete({ where: { id: item.id } });
    for (const id of item.imageAttachmentIds) await deleteAttachmentAndReclaim(id).catch(() => {});
    return { status: "ok" };
  });

  // --- Challenges -------------------------------------------------------

  app.get("/api/challenges", async () => {
    const challenges = await prisma.challenge.findMany({
      include: { _count: { select: { submissions: true } } },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return challenges.map((c) => ({ id: c.id, title: c.title, prompt: c.prompt, active: c.active, submissionCount: c._count.submissions, createdAt: c.createdAt, ogTitle: c.ogTitle, ogDescription: c.ogDescription, ogImageUrl: c.ogImageUrl }));
  });

  app.get<{ Params: { id: string } }>("/api/challenges/:id", async (req, reply) => {
    const challenge = await prisma.challenge.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        submissions: {
          include: {
            user: { select: { username: true } },
            track: { include: { album: { select: { title: true, slug: true, coverArtUrl: true } }, attachment: { select: { storagePath: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!challenge) return reply.code(404).send({ error: "no such challenge" });
    return {
      id: challenge.id,
      title: challenge.title,
      prompt: challenge.prompt,
      active: challenge.active,
      submissions: challenge.submissions.map((s) => ({
        id: s.id,
        username: s.user.username,
        trackTitle: s.track.title,
        albumTitle: s.track.album.title,
        albumSlug: s.track.album.slug,
        coverArtUrl: s.track.album.coverArtUrl,
        fileUrl: s.track.attachment?.storagePath ?? s.track.externalUrl ?? "",
      })),
    };
  });

  app.post<{ Body: { title: string; prompt: string } }>("/api/admin/challenges", { preHandler: requireAdmin }, async (req, reply) => {
    const { title, prompt } = req.body ?? {};
    if (!title || !prompt) return reply.code(400).send({ error: "title and prompt are required" });
    const challenge = await prisma.challenge.create({ data: { title, prompt } });
    return reply.code(201).send(challenge);
  });

  app.patch<{ Params: { id: string }; Body: { active?: boolean; title?: string; prompt?: string; ogTitle?: string | null; ogDescription?: string | null; ogImageUrl?: string | null } }>("/api/admin/challenges/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.active !== undefined) data.active = b.active === true;
    if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 200);
    if (typeof b.prompt === "string" && b.prompt.trim()) data.prompt = b.prompt.trim();
    for (const [key, max] of [["ogTitle", 200], ["ogDescription", 400]] as const) { const v = cleanText(b[key], max); if (v !== undefined) data[key] = v; }
    if (b.ogImageUrl !== undefined) { const v = cleanUrl(b.ogImageUrl); if (v === undefined) return reply.code(400).send({ error: "ogImageUrl must be a web address (https://...)" }); data.ogImageUrl = v; }
    return prisma.challenge.update({ where: { id: Number(req.params.id) }, data });
  });

  app.post<{ Params: { id: string }; Body: { trackId: number } }>("/api/challenges/:id/submit", { preHandler: requireAuth }, async (req, reply) => {
    const challenge = await prisma.challenge.findUnique({ where: { id: Number(req.params.id) } });
    if (!challenge) return reply.code(404).send({ error: "no such challenge" });
    if (!challenge.active) return reply.code(400).send({ error: "this challenge is no longer accepting submissions" });
    const track = await prisma.communityTrack.findUnique({ where: { id: req.body.trackId }, include: { album: true } });
    if (!track || track.album.ownerId !== req.user!.id) return reply.code(403).send({ error: "you can only submit your own tracks" });
    try {
      const submission = await prisma.challengeSubmission.create({
        data: { challengeId: challenge.id, trackId: track.id, userId: req.user!.id },
      });
      return reply.code(201).send(submission);
    } catch {
      return reply.code(409).send({ error: "already submitted this track to this challenge" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/challenge-submissions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const submission = await prisma.challengeSubmission.findUnique({ where: { id: Number(req.params.id) } });
    if (!submission) return reply.code(404).send({ error: "no such submission" });
    if (submission.userId !== req.user!.id) return reply.code(403).send({ error: "not yours" });
    await prisma.challengeSubmission.delete({ where: { id: submission.id } });
    return { status: "ok" };
  });
}
