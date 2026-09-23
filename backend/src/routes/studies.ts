import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";

async function uniqueStudySlug(title: string): Promise<string> {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "study";
  let slug = base;
  let n = 1;
  while (await prisma.study.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}
async function uniqueChannelSlug(title: string): Promise<string> {
  const base = `study-${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` || "study";
  let slug = base;
  let n = 1;
  while (await prisma.forumChannel.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export async function studiesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/studies", async () => {
    const studies = await prisma.study.findMany({
      select: { slug: true, title: true, status: true, createdAt: true, updatedAt: true, owner: { select: { username: true } }, channel: { select: { slug: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return studies.map((s) => ({
      slug: s.slug,
      title: s.title,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      owner: s.owner.username,
      channelSlug: s.channel?.slug ?? null,
    }));
  });

  app.get<{ Params: { slug: string } }>("/api/studies/:slug", async (req, reply) => {
    const study = await prisma.study.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { id: true, username: true } },
        channel: { select: { slug: true } },
        annotations: { orderBy: { position: "asc" } },
        charts: { orderBy: { position: "asc" } },
      },
    });
    if (!study) return reply.code(404).send({ error: "no such study" });
    return study;
  });

  app.post<{ Body: { title: string; body?: string } }>("/api/studies", { preHandler: requireAuth }, async (req, reply) => {
    const { title, body } = req.body ?? {};
    if (!title?.trim()) return reply.code(400).send({ error: "title is required" });
    const slug = await uniqueStudySlug(title.trim());
    const channelSlug = await uniqueChannelSlug(title.trim());

    const channel = await prisma.forumChannel.create({
      data: { slug: channelSlug, name: title.trim(), category: "Studies", kind: "DISCUSSION" },
    });
    const study = await prisma.study.create({
      data: { slug, title: title.trim(), body: body?.trim() || "", ownerId: req.user!.id, channelId: channel.id },
    });
    await prisma.forumMapNode.create({ data: { type: "STUDY", studyId: study.id } });
    return reply.code(201).send(study);
  });

  app.patch<{ Params: { slug: string }; Body: Partial<{ title: string; body: string; status: "IN_PROGRESS" | "COMPLETE" }> }>(
    "/api/studies/:slug",
    { preHandler: requireAuth },
    async (req, reply) => {
      const study = await prisma.study.findUnique({ where: { slug: req.params.slug } });
      if (!study) return reply.code(404).send({ error: "no such study" });
      if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      const updated = await prisma.study.update({ where: { id: study.id }, data: req.body ?? {} });
      return updated;
    },
  );

  app.delete<{ Params: { slug: string } }>("/api/studies/:slug", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    await prisma.study.delete({ where: { id: study.id } });
    return reply.code(204).send();
  });

  // --- Annotations: author-only, endnote-style, numbered by position ---

  app.post<{ Params: { slug: string }; Body: { text: string } }>("/api/studies/:slug/annotations", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug }, include: { annotations: true } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });
    const nextPosition = study.annotations.length + 1;
    const annotation = await prisma.studyAnnotation.create({ data: { studyId: study.id, position: nextPosition, text } });
    return reply.code(201).send(annotation);
  });

  app.patch<{ Params: { id: string }; Body: { text: string } }>("/api/study-annotations/:id", { preHandler: requireAuth }, async (req, reply) => {
    const annotation = await prisma.studyAnnotation.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
    if (!annotation) return reply.code(404).send({ error: "no such annotation" });
    if (annotation.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });
    return prisma.studyAnnotation.update({ where: { id: annotation.id }, data: { text } });
  });

  app.delete<{ Params: { id: string } }>("/api/study-annotations/:id", { preHandler: requireAuth }, async (req, reply) => {
    const annotation = await prisma.studyAnnotation.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
    if (!annotation) return reply.code(404).send({ error: "no such annotation" });
    if (annotation.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    await prisma.studyAnnotation.delete({ where: { id: annotation.id } });
    // Renumber the remaining annotations so positions stay contiguous
    // (1, 2, 3...) after a deletion in the middle, keeping the [n]
    // numbering the author sees consistent with what's actually there.
    const remaining = await prisma.studyAnnotation.findMany({ where: { studyId: annotation.studyId }, orderBy: { position: "asc" } });
    await prisma.$transaction(remaining.map((a, i) => prisma.studyAnnotation.update({ where: { id: a.id }, data: { position: i + 1 } })));
    return reply.code(204).send();
  });

  app.post<{ Params: { slug: string }; Body: { annotationIds: number[] } }>(
    "/api/studies/:slug/annotations/reorder",
    { preHandler: requireAuth },
    async (req, reply) => {
      const study = await prisma.study.findUnique({ where: { slug: req.params.slug }, include: { annotations: true } });
      if (!study) return reply.code(404).send({ error: "no such study" });
      if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      const { annotationIds } = req.body ?? { annotationIds: [] };
      const ownIds = new Set(study.annotations.map((a) => a.id));
      if (annotationIds.length !== ownIds.size || !annotationIds.every((id) => ownIds.has(id))) {
        return reply.code(400).send({ error: "annotationIds must include exactly this study's annotations" });
      }
      await prisma.$transaction(annotationIds.map((id, i) => prisma.studyAnnotation.update({ where: { id }, data: { position: i + 1 } })));
      return reply.code(204).send();
    },
  );

  // --- Charts/data tables: author-only, positioned within the study ---

  app.post<{ Params: { slug: string }; Body: { title: string; kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel?: string; yLabel?: string; dataCsv: string } }>(
    "/api/studies/:slug/charts",
    { preHandler: requireAuth },
    async (req, reply) => {
      const study = await prisma.study.findUnique({ where: { slug: req.params.slug }, include: { charts: true } });
      if (!study) return reply.code(404).send({ error: "no such study" });
      if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      const { title, kind, xLabel, yLabel, dataCsv } = req.body ?? {};
      if (!title?.trim() || !dataCsv?.trim()) return reply.code(400).send({ error: "title and dataCsv are required" });
      const nextPosition = study.charts.length + 1;
      const chart = await prisma.studyChart.create({
        data: { studyId: study.id, position: nextPosition, title: title.trim(), kind: kind ?? "LINE", xLabel: xLabel?.trim() || null, yLabel: yLabel?.trim() || null, dataCsv },
      });
      return reply.code(201).send(chart);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel: string | null; yLabel: string | null; dataCsv: string }> }>(
    "/api/study-charts/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const chart = await prisma.studyChart.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
      if (!chart) return reply.code(404).send({ error: "no such chart" });
      if (chart.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      return prisma.studyChart.update({ where: { id: chart.id }, data: req.body ?? {} });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/study-charts/:id", { preHandler: requireAuth }, async (req, reply) => {
    const chart = await prisma.studyChart.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
    if (!chart) return reply.code(404).send({ error: "no such chart" });
    if (chart.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    await prisma.studyChart.delete({ where: { id: chart.id } });
    return reply.code(204).send();
  });

  app.post<{ Params: { slug: string }; Body: { chartIds: number[] } }>("/api/studies/:slug/charts/reorder", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug }, include: { charts: true } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    const { chartIds } = req.body ?? { chartIds: [] };
    const ownIds = new Set(study.charts.map((c) => c.id));
    if (chartIds.length !== ownIds.size || !chartIds.every((id) => ownIds.has(id))) {
      return reply.code(400).send({ error: "chartIds must include exactly this study's charts" });
    }
    await prisma.$transaction(chartIds.map((id, i) => prisma.studyChart.update({ where: { id }, data: { position: i + 1 } })));
    return reply.code(204).send();
  });
}
