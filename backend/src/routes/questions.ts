import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, verifyToken } from "../lib/auth.js";

function optionalUserId(req: { headers: { authorization?: string } }): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7))?.id ?? null;
}

async function uniqueQuestionSlug(title: string): Promise<string> {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "question";
  let slug = base;
  let n = 1;
  while (await prisma.forumChannel.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export async function questionsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { mine?: string } }>("/api/questions", async (req) => {
    const questions = await prisma.forumChannel.findMany({
      where: req.query.mine === "true" ? { isUserQuestion: true, askedById: optionalUserId(req) ?? -1 } : { isUserQuestion: true },
      select: { slug: true, name: true, description: true, createdAt: true, askedBy: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
    return questions.map((q) => ({ slug: q.slug, title: q.name, description: q.description, askedBy: q.askedBy?.username ?? "unknown", createdAt: q.createdAt }));
  });

  app.post<{ Body: { title: string; description?: string } }>("/api/questions", { preHandler: requireAuth }, async (req, reply) => {
    const { title, description } = req.body ?? {};
    if (!title?.trim()) return reply.code(400).send({ error: "title is required" });
    const slug = await uniqueQuestionSlug(title.trim());
    const channel = await prisma.forumChannel.create({
      data: {
        slug,
        name: title.trim(),
        description: description?.trim() || null,
        category: "Questions",
        kind: "DISCUSSION",
        isUserQuestion: true,
        askedById: req.user!.id,
      },
    });
    return reply.code(201).send(channel);
  });
}
