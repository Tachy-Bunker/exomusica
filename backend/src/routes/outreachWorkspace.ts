import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";
import { cleanDnc, buildDigest, safeRedirect, weekStart } from "../lib/outreachRules.js";
import { makeLimiter, signWorkspaceToken, slugify } from "../lib/outreachScope.js";
import { dbFor, fail, shapeContact, today, WITH_GROUPS, type workspaceAuth } from "./outreachShared.js";

type Pre = { preHandler: typeof workspaceAuth };
const perSlug = makeLimiter(8, 10 * 60_000), perIp = makeLimiter(40, 60 * 60_000);
const DUMMY = argon2.hash("not-a-real-password"); // so a wrong slug takes as long as a wrong password

const isAdmin = (h: string | undefined): boolean => !!h?.startsWith("Bearer ") && !!verifyToken(h.slice(7))?.isAdmin;
const cleanProfile = (v: unknown): object => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const words = (x: unknown): string[] => (Array.isArray(x) ? x.flatMap((w) => (typeof w === "string" && w.trim() ? [w.trim().toLowerCase().slice(0, 40)] : [])).slice(0, 60) : []);
  const num = (x: unknown): number | null => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n < 1e7 ? n : null; };
  return { keywords: words(o.keywords), avoid: words(o.avoid), regions: words(o.regions), maxFee: num(o.maxFee), yearlyBudget: num(o.yearlyBudget), home: typeof o.home === "string" ? o.home.slice(0, 80) : "", homeLat: num(o.homeLat), homeLng: num(o.homeLng) };
};
const cleanAttach = (v: unknown): { group: number; fileId: number }[] => (Array.isArray(v) ? v.flatMap((r) => (r && Number.isInteger(r.group) && Number.isInteger(r.fileId) ? [{ group: r.group as number, fileId: r.fileId as number }] : [])).slice(0, 100) : []);

/** Moves what was built in the single-owner Outreach (rows without a workspace) into the first workspace. */
async function adoptLegacy(workspaceId: number): Promise<number> {
  const none = { workspaceId: null };
  const [c, ct, g, s, bt, tp, sc] = await prisma.$transaction([
    prisma.outreachColumn.updateMany({ where: none, data: { workspaceId } }), prisma.outreachContact.updateMany({ where: none, data: { workspaceId } }),
    prisma.outreachGroup.updateMany({ where: none, data: { workspaceId } }), prisma.outreachSend.updateMany({ where: none, data: { workspaceId } }),
    prisma.outreachBlockType.updateMany({ where: none, data: { workspaceId } }), prisma.outreachTemplate.updateMany({ where: none, data: { workspaceId } }),
    prisma.outreachScheduled.updateMany({ where: none, data: { workspaceId } }),
  ]);
  const old = await prisma.outreachSettings.findUnique({ where: { id: 1 } });
  if (old && (old.smtpHost || old.smtpUser || old.fromEmail)) {
    const { id: _id, updatedAt: _u, ...rest } = old;
    await prisma.outreachAccount.create({ data: { ...rest, workspaceId, label: old.fromEmail || "Main mailbox", isDefault: true } });
  }
  return c.count + ct.count + g.count + s.count + bt.count + tp.count + sc.count;
}

export async function legacyCount(): Promise<number> { return (await prisma.outreachContact.count({ where: { workspaceId: null } })) + (await prisma.outreachBlockType.count({ where: { workspaceId: null } })); }

export async function outreachWorkspaceRoutes(app: FastifyInstance, W: Pre): Promise<void> {
  // The page's first question: which workspaces exist? Only the site's admin sees the list; everyone else needs the address.
  app.get("/api/outreach/workspaces", async (req) => {
    const admin = isAdmin(req.headers.authorization);
    const list = admin ? await prisma.outreachWorkspace.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }) : [];
    return { workspaces: list, admin, canCreate: admin || process.env.OUTREACH_OPEN_CREATE === "1", legacy: admin ? await legacyCount() : 0 };
  });
  app.get<{ Params: { slug: string } }>("/api/outreach/w/:slug", async (req, reply) => {
    const ws = await prisma.outreachWorkspace.findUnique({ where: { slug: req.params.slug.toLowerCase() }, select: { id: true, slug: true, name: true } });
    return ws ?? fail(reply, 404, "No workspace at this address.");
  });

  app.post<{ Body: { slug?: string; password?: string } }>("/api/outreach/enter", async (req, reply) => {
    const slug = String(req.body?.slug ?? "").toLowerCase().slice(0, 60), pass = String(req.body?.password ?? "").slice(0, 300);
    const ipKey = `ip:${req.ip}`, slugKey = `${req.ip}:${slug}`;
    const wait = Math.max(perIp.blocked(ipKey), perSlug.blocked(slugKey));
    if (wait > 0) return fail(reply, 429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 90 ? "s" : ""}.`);
    const ws = await prisma.outreachWorkspace.findUnique({ where: { slug } });
    const ok = await argon2.verify(ws?.passwordHash ?? (await DUMMY), pass).catch(() => false);
    if (!ws || !ok) { perSlug.fail(slugKey); perIp.fail(ipKey); return fail(reply, 401, "Wrong workspace or password."); }
    perSlug.clear(slugKey);
    return { token: signWorkspaceToken(ws.id, ws.tokenVersion), workspace: { id: ws.id, slug: ws.slug, name: ws.name } };
  });

  app.post<{ Body: { name?: string; password?: string; slug?: string; adoptLegacy?: boolean } }>("/api/outreach/workspaces", async (req, reply) => {
    const admin = isAdmin(req.headers.authorization);
    if (!admin && process.env.OUTREACH_OPEN_CREATE !== "1") return fail(reply, 403, "Only the site's admin can create a workspace.");
    const b = req.body ?? {}; const name = (b.name ?? "").trim().slice(0, 60), pass = String(b.password ?? "");
    if (!name) return fail(reply, 400, "Give the workspace a name (the artist).");
    if (pass.length < 8 || pass.length > 200) return fail(reply, 400, "The password needs at least 8 characters.");
    const slug = slugify(b.slug || name); if (!slug) return fail(reply, 400, "That name can't make an address.");
    if (await prisma.outreachWorkspace.findUnique({ where: { slug } })) return fail(reply, 409, "There is already a workspace at that address.");
    const ws = await prisma.outreachWorkspace.create({ data: { slug, name, passwordHash: await argon2.hash(pass) } });
    const adopted = admin && b.adoptLegacy === true ? await adoptLegacy(ws.id) : 0;
    return reply.code(201).send({ token: signWorkspaceToken(ws.id, ws.tokenVersion), workspace: { id: ws.id, slug: ws.slug, name: ws.name }, adopted });
  });

  app.put<{ Body: Record<string, unknown> }>("/api/outreach/workspace", { ...W, bodyLimit: 128 * 1024 }, async (req, reply) => {
    const b = req.body ?? {}; const data: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 60);
    if (typeof b.trackLinks === "boolean") data.trackLinks = b.trackLinks;
    if (typeof b.digestOn === "boolean") data.digestOn = b.digestOn;
    if ("dnc" in b) data.dnc = cleanDnc(b.dnc);
    if ("profile" in b) data.profile = cleanProfile(b.profile);
    if ("attachRules" in b) {
      const rules = cleanAttach(b.attachRules); const mine = new Set((await req.db.outreachFile.findMany({ where: { id: { in: rules.map((r) => r.fileId) } }, select: { id: true } })).map((f) => f.id));
      data.attachRules = rules.filter((r) => mine.has(r.fileId));
    }
    const ws = await prisma.outreachWorkspace.update({ where: { id: req.ox.id }, data });
    return reply.send({ name: ws.name, trackLinks: ws.trackLinks, dnc: ws.dnc, profile: ws.profile, attachRules: ws.attachRules, digestOn: ws.digestOn, trackAvailable: !!process.env.PUBLIC_URL });
  });

  app.post<{ Body: { current?: string; next?: string } }>("/api/outreach/workspace/password", W, async (req, reply) => {
    const next = String(req.body?.next ?? ""); if (next.length < 8 || next.length > 200) return fail(reply, 400, "The new password needs at least 8 characters.");
    if (!isAdmin(req.headers.authorization) && !(await argon2.verify(req.ox.passwordHash, String(req.body?.current ?? "")).catch(() => false))) return fail(reply, 403, "The current password is wrong.");
    const ws = await prisma.outreachWorkspace.update({ where: { id: req.ox.id }, data: { passwordHash: await argon2.hash(next), tokenVersion: { increment: 1 } } });
    return { token: signWorkspaceToken(ws.id, ws.tokenVersion) }; // everyone else is signed out
  });
  app.post("/api/outreach/workspace/sign-out-everyone", W, async (req) => {
    const ws = await prisma.outreachWorkspace.update({ where: { id: req.ox.id }, data: { tokenVersion: { increment: 1 } } });
    return { token: signWorkspaceToken(ws.id, ws.tokenVersion) };
  });
  app.delete<{ Body: { password?: string } }>("/api/outreach/workspace", W, async (req, reply) => {
    if (!isAdmin(req.headers.authorization) && !(await argon2.verify(req.ox.passwordHash, String(req.body?.password ?? "")).catch(() => false))) return fail(reply, 403, "Enter the workspace password to delete it.");
    const id = req.ox.id; const where = { workspaceId: id };
    const types = await prisma.outreachBlockType.findMany({ where, select: { id: true } });
    await prisma.$transaction([
      prisma.outreachBlock.deleteMany({ where: { typeId: { in: types.map((t) => t.id) } } }),
      prisma.outreachBlockType.deleteMany({ where }), prisma.outreachScheduled.deleteMany({ where }), prisma.outreachSend.deleteMany({ where }), prisma.outreachMessage.deleteMany({ where }),
      prisma.outreachLink.deleteMany({ where }), prisma.outreachLead.deleteMany({ where }), prisma.outreachFeed.deleteMany({ where }), prisma.outreachFile.deleteMany({ where }), prisma.outreachFileGroup.deleteMany({ where }),
      prisma.outreachTemplate.deleteMany({ where }), prisma.outreachContact.deleteMany({ where }), prisma.outreachGroup.deleteMany({ where }), prisma.outreachColumn.deleteMany({ where }), prisma.outreachAccount.deleteMany({ where }),
      prisma.outreachWorkspace.delete({ where: { id } }),
    ]);
    return { ok: true };
  });

  // Tracked links: a plain redirect. It stores a count and a time, nothing about the visitor.
  app.get<{ Params: { code: string } }>("/o/:code", async (req, reply) => {
    const link = await prisma.outreachLink.findUnique({ where: { code: req.params.code.slice(0, 20) } });
    const to = link ? safeRedirect(link.url) : null; if (!link || !to) return reply.code(404).type("text/plain").send("Not found");
    void prisma.outreachLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } }).catch(() => {});
    return reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer").redirect(to, 302);
  });
  app.get("/api/outreach/links", W, async (req) => {
    const rows = await req.db.outreachLink.findMany({ where: { clicks: { gt: 0 } }, orderBy: { lastClickAt: "desc" }, take: 100 });
    return rows.map((l) => ({ code: l.code, url: l.url, contactId: l.contactId, clicks: l.clicks, lastClickAt: l.lastClickAt?.toISOString() ?? null }));
  });
}

/** Mondays from 07:00 UTC: the digest goes to each opted-in workspace's own mailbox, once a week. */
export async function sendDigests(run: (db: ReturnType<typeof dbFor>, workspaceId: number, body: Record<string, unknown>) => Promise<{ code: number; body: Record<string, unknown> }>): Promise<void> {
  const now = new Date(); if (now.getUTCHours() < 7) return;
  const start = weekStart(now); const list = await prisma.outreachWorkspace.findMany({ where: { digestOn: true } });
  for (const ws of list) {
    if (ws.digestAt && ws.digestAt.toISOString().slice(0, 10) >= start) continue;
    await prisma.outreachWorkspace.update({ where: { id: ws.id }, data: { digestAt: now } }); // claimed first: a failure doesn't mean a mail every minute
    const db = dbFor(ws.id); const acct = (await db.outreachAccount.findFirst({ where: { isDefault: true } })) ?? (await db.outreachAccount.findFirst()); const to = acct?.fromEmail || acct?.smtpUser; if (!to) continue;
    const contacts = (await db.outreachContact.findMany({ include: WITH_GROUPS })).map(shapeContact);
    const d = buildDigest(contacts.map((c) => ({ name: c.name, email: c.email, status: c.status, followUpAt: c.followUpAt, deadline: c.deadline, repliedAt: c.repliedAt, reopensAt: c.reopensAt, snoozeReason: c.snoozeReason })), today());
    if (!d) continue;
    await run(db, ws.id, { subject: d.subject, bodyMd: d.bodyMd, extraTo: to, accountId: acct?.id, signature: false }).catch(() => {});
  }
}
