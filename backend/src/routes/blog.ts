import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { sendTemplatedMail } from "../lib/emailTemplates.js";

export async function blogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/blog", async () => {
    return prisma.blogPost.findMany({
      where: { publishedAt: { not: null } },
      select: { id: true, slug: true, title: true, coverImageUrl: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    });
  });

  app.get<{ Params: { slug: string } }>("/api/blog/:slug", async (req, reply) => {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
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
    Body: Partial<{ title: string; contentMarkdown: string; coverImageUrl: string; publish: boolean }>;
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
        prisma.newsletterSubscription.findMany({ select: { email: true } }),
        prisma.user.findMany({ where: { notifyNews: true, isGhost: false }, select: { username: true, email: true } }),
      ]);

      const seen = new Set<string>();
      const excerpt = post.contentMarkdown.replace(/[#*`]/g, "").slice(0, 300);
      let notified = 0;

      for (const m of members) {
        if (!m.email || seen.has(m.email)) continue;
        seen.add(m.email);
        void sendTemplatedMail("NEWS", m.email, m.username, { postTitle: post.title, postExcerpt: excerpt });
        notified++;
      }
      for (const s of subs) {
        if (seen.has(s.email)) continue;
        seen.add(s.email);
        void sendTemplatedMail("NEWS", s.email, "there", { postTitle: post.title, postExcerpt: excerpt });
        notified++;
      }
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
