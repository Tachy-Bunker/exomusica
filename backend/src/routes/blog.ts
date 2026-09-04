import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { sendTemplatedMail } from "../lib/emailTemplates.js";
import { sendDiscordAnnouncement } from "../lib/discordBot.js";

export async function blogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/newsletter-subscriptions", { preHandler: requireAdmin }, async () => {
    const [formSubs, accountSubs] = await Promise.all([
      prisma.newsletterSubscription.findMany({
        select: { id: true, email: true, confirmed: true, subscribed: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { notifyNews: true, isGhost: false },
        select: { id: true, email: true, username: true, createdAt: true },
      }),
    ]);
    const formEmails = new Set(formSubs.map((s) => s.email.toLowerCase()));
    return [
      ...formSubs.map((s) => ({ id: `form:${s.id}`, email: s.email, subscribed: s.subscribed, source: "form" as const, createdAt: s.createdAt })),
      // Skip account-based entries whose email already appears as a form
      // signup — same person, don't list them twice.
      ...accountSubs
        .filter((u) => !formEmails.has(u.email.toLowerCase()))
        .map((u) => ({ id: `account:${u.id}`, email: u.email, subscribed: true, source: "account" as const, createdAt: u.createdAt, username: u.username })),
    ];
  });

  app.patch<{ Params: { id: string }; Body: { subscribed: boolean } }>(
    "/api/admin/newsletter-subscriptions/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const [kind, rawId] = req.params.id.split(":");
      const id = Number(rawId);
      if (kind === "form") {
        return prisma.newsletterSubscription.update({ where: { id }, data: { subscribed: req.body.subscribed } });
      }
      if (kind === "account") {
        return prisma.user.update({ where: { id }, data: { notifyNews: req.body.subscribed } });
      }
      return reply.code(400).send({ error: "unknown subscriber id format" });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/newsletter-subscriptions/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const [kind, rawId] = req.params.id.split(":");
    if (kind !== "form") return reply.code(400).send({ error: "account-based subscribers can only be unsubscribed, not deleted here — that's their account preference" });
    await prisma.newsletterSubscription.delete({ where: { id: Number(rawId) } });
    return { status: "ok" };
  });

  // Bulk-add from a pasted/uploaded list — one email per line. Skips
  // anything already in the table (by email) rather than erroring, and
  // ignores blank lines and anything that doesn't look like an email.
  app.post<{ Body: { emails: string[] } }>("/api/admin/newsletter-subscriptions/bulk-import", { preHandler: requireAdmin }, async (req, reply) => {
    const emails = req.body?.emails ?? [];
    const valid = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
    if (valid.length === 0) return reply.code(400).send({ error: "no valid email addresses found" });

    const existing = await prisma.newsletterSubscription.findMany({ where: { email: { in: valid } }, select: { email: true } });
    const existingSet = new Set(existing.map((e) => e.email));
    const toCreate = valid.filter((e) => !existingSet.has(e));

    await prisma.newsletterSubscription.createMany({
      data: toCreate.map((email) => ({ email, confirmed: true, subscribed: true, unsubscribeToken: randomUUID() })),
    });

    return { added: toCreate.length, skippedDuplicates: valid.length - toCreate.length };
  });

  app.get("/api/blog", async () => {
    return prisma.blogPost.findMany({
      where: { publishedAt: { not: null } },
      select: { id: true, slug: true, title: true, coverImageUrl: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/blog/:slug", async (req, reply) => {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug }, include: { font: true } });
    if (!post || !post.publishedAt) return reply.code(404).send({ error: "no such post" });
    return post;
  });

  app.get("/api/admin/blog", { preHandler: requireAdmin }, async () => {
    return prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post<{
    Body: { slug: string; title: string; contentMarkdown: string; coverImageUrl?: string; publish?: boolean };
  }>("/api/admin/blog", { preHandler: requireAdmin }, async (req, reply) => {
    const { slug, title, contentMarkdown, coverImageUrl, publish } = req.body ?? {};
    if (!slug || !title || !contentMarkdown) {
      return reply.code(400).send({ error: "slug, title, and contentMarkdown are required" });
    }
    const post = await prisma.blogPost.create({
      data: {
        slug,
        title,
        contentMarkdown,
        coverImageUrl,
        authorId: req.user!.id,
        publishedAt: publish ? new Date() : null,
      },
    });
    return reply.code(201).send(post);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; contentMarkdown: string; coverImageUrl: string; publish: boolean; fontId: number | null }>;
  }>("/api/admin/blog/:id", { preHandler: requireAdmin }, async (req) => {
    const { publish, ...rest } = req.body ?? {};
    return prisma.blogPost.update({
      where: { id: Number(req.params.id) },
      data: { ...rest, ...(publish !== undefined ? { publishedAt: publish ? new Date() : null } : {}) },
    });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/blog/:id", { preHandler: requireAdmin }, async (req, reply) => {
    await prisma.blogPost.delete({ where: { id: Number(req.params.id) } });
    return reply.code(204).send();
  });

  // Separate, admin-triggered step from publishing — you might publish a
  // post and only email the list once, later, or never. There's no
  // confirmation/double-opt-in flow on subscription (see the note at
  // /api/newsletter/subscribe below), so this sends to every row in
  // NewsletterSubscription regardless of `confirmed` — that field exists
  // for a future opt-in flow but nothing sets it true yet.
  app.post<{ Params: { id: string } }>(
    "/api/admin/blog/:id/notify-subscribers",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const post = await prisma.blogPost.findUnique({ where: { id: Number(req.params.id) } });
      if (!post || !post.publishedAt) return reply.code(400).send({ error: "post must be published first" });

      const [subs, members] = await Promise.all([
        prisma.newsletterSubscription.findMany({ where: { subscribed: true }, select: { email: true } }),
        prisma.user.findMany({ where: { notifyNews: true, isGhost: false }, select: { username: true, email: true } }),
      ]);

      const seen = new Set<string>();
      const excerpt = post.contentMarkdown.replace(/[#*`]/g, "").slice(0, 300);
      let notified = 0;

      for (const m of members) {
        if (!m.email || seen.has(m.email)) continue;
        seen.add(m.email);
        void sendTemplatedMail("NEWS", m.email, m.username, { postTitle: post.title, postExcerpt: excerpt }).catch((err) =>
          app.log.error(err, "sendTemplatedMail failed"),
        );
        notified++;
      }
      for (const s of subs) {
        if (seen.has(s.email)) continue;
        seen.add(s.email);
        void sendTemplatedMail("NEWS", s.email, "there", { postTitle: post.title, postExcerpt: excerpt }).catch((err) =>
          app.log.error(err, "sendTemplatedMail failed"),
        );
        notified++;
      }
      void sendDiscordAnnouncement("news_published", `New Exomusica News: "${post.title}" — ${excerpt.slice(0, 200)}`);
      return { notified };
    },
  );

  // Captures the subscription only — sending happens separately, via the
  // admin's "notify subscribers" action on a published post (above). There's
  // no confirmation/double-opt-in email; every subscriber gets emailed on
  // that action regardless of `confirmed`.
  app.post<{ Body: { email: string } }>("/api/newsletter/subscribe", async (req, reply) => {
    const { email } = req.body ?? {};
    if (!email) return reply.code(400).send({ error: "email is required" });
    const sub = await prisma.newsletterSubscription.upsert({
      where: { email },
      create: { email, unsubscribeToken: randomUUID() },
      update: {},
    });
    return reply.code(201).send({ email: sub.email });
  });
}
