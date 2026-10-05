import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { recordStudyRevision } from "../lib/studyRevisions.js";
import { deleteAttachmentAndReclaim, saveMessageAttachment } from "../lib/storage.js";
import { deleteAllStudyFiles, releaseStudyFiles, sweepAbandonedStudyFiles, type FileOps } from "../lib/studyFiles.js";
import { removedFileNames, safeStudyUploadName, uploadedFileNames } from "../lib/studyFileRules.js";

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
  // File cleanup is best-effort housekeeping: it logs failures but never makes the user's own action fail.
  const filesFor = (req: { log: { warn: (o: object, m: string) => void } }): FileOps => ({ db: prisma, warn: (o, m) => req.log.warn(o, m) });

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

      // Only these fields may be changed through this route. (Passing the raw
      // body through would let an owner rewrite ownerId, slug, channelId...)
      const { title, body, status } = req.body ?? {};
      const data: { title?: string; body?: string; status?: "IN_PROGRESS" | "COMPLETE" } = {};
      if (typeof title === "string") {
        if (!title.trim()) return reply.code(400).send({ error: "title can't be empty" });
        data.title = title.trim();
      }
      if (typeof body === "string") data.body = body;
      if (status === "IN_PROGRESS" || status === "COMPLETE") data.status = status;

      const contentChanged = (data.title !== undefined && data.title !== study.title) || (data.body !== undefined && data.body !== study.body);

      // History is best-effort: if recording fails the save must still go through.
      if (contentChanged) {
        try {
          const existing = await prisma.studyRevision.count({ where: { studyId: study.id } });
          if (existing === 0) {
            // first edit ever - keep the pre-edit text so it can be restored
            await prisma.studyRevision.create({ data: { studyId: study.id, authorId: study.ownerId, title: study.title, body: study.body, label: "Original" } });
          }
        } catch (err) {
          req.log.warn({ err, studyId: study.id }, "failed to snapshot original study text");
        }
      }

      const updated = await prisma.study.update({ where: { id: study.id }, data });

      if (contentChanged) {
        try {
          await recordStudyRevision(prisma, study.id, { authorId: req.user!.id, title: updated.title, body: updated.body });
        } catch (err) {
          req.log.warn({ err, studyId: study.id }, "failed to record study revision");
        }
      }

      // An audio block or image removed from the text no longer needs its file; and uploads that never made it
      // into the study (started an edit, uploaded, walked away) get swept once they're old enough.
      if (data.body !== undefined && data.body !== study.body) {
        try {
          await releaseStudyFiles(filesFor(req), study.id, removedFileNames(study.body, data.body));
          await sweepAbandonedStudyFiles(filesFor(req), study.id);
        } catch (err) {
          req.log.warn({ err, studyId: study.id }, "study file cleanup after save failed");
        }
      }
      return updated;
    },
  );

  // --- Files (audio recordings, spectrograms) uploaded into a study ---

  app.post<{ Params: { slug: string } }>("/api/studies/:slug/files", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const name = safeStudyUploadName(file.filename, file.mimetype);
    if (!name) {
      file.file.resume();
      return reply.code(400).send({ error: "only audio files and PNG, JPEG or WebP images can be added to a study" });
    }
    const buffer = await file.toBuffer();
    let attachment;
    try {
      attachment = await saveMessageAttachment(req.user!.id, name, file.mimetype, buffer); // counts toward the uploader's storage quota like any attachment
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
    try {
      await prisma.attachment.update({ where: { id: attachment.id }, data: { studyId: study.id } });
    } catch (err) {
      await deleteAttachmentAndReclaim(attachment.id).catch(() => undefined); // never leave an untagged, untrackable file behind
      throw err;
    }
    return reply.code(201).send({ id: attachment.id, url: attachment.storagePath, filename: attachment.filename, sizeBytes: Number(attachment.sizeBytes) });
  });

  // --- Revision history: owner/admin only ---

  app.get<{ Params: { slug: string } }>("/api/studies/:slug/revisions", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    // metadata only - bodies can be large and there can be many revisions
    return prisma.studyRevision.findMany({
      where: { studyId: study.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, label: true, title: true, createdAt: true, author: { select: { username: true } } },
    });
  });

  app.get<{ Params: { id: string } }>("/api/study-revisions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const revision = await prisma.studyRevision.findUnique({
      where: { id: Number(req.params.id) },
      include: { study: true, author: { select: { username: true } } },
    });
    if (!revision) return reply.code(404).send({ error: "no such revision" });
    if (revision.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    return { id: revision.id, title: revision.title, body: revision.body, label: revision.label, createdAt: revision.createdAt, author: revision.author };
  });

  app.post<{ Params: { id: string } }>("/api/study-revisions/:id/restore", { preHandler: requireAuth }, async (req, reply) => {
    const revision = await prisma.studyRevision.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
    if (!revision) return reply.code(404).send({ error: "no such revision" });
    const study = revision.study;
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });

    // Snapshot where things stand first, so a restore itself can be undone.
    // (Skipped automatically if the newest snapshot already matches.)
    await recordStudyRevision(prisma, study.id, { authorId: req.user!.id, title: study.title, body: study.body, label: "Before restore" });
    const updated = await prisma.study.update({ where: { id: study.id }, data: { title: revision.title, body: revision.body } });
    const when = revision.createdAt.toISOString().slice(0, 16).replace("T", " ");
    await recordStudyRevision(prisma, study.id, { authorId: req.user!.id, title: updated.title, body: updated.body, label: `Restored from ${when} UTC` });
    return updated;
  });

  app.delete<{ Params: { slug: string } }>("/api/studies/:slug", { preHandler: requireAuth }, async (req, reply) => {
    const study = await prisma.study.findUnique({ where: { slug: req.params.slug } });
    if (!study) return reply.code(404).send({ error: "no such study" });
    if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    try {
      await deleteAllStudyFiles(filesFor(req), study.id); // before the study row goes, while we can still find its files
    } catch (err) {
      req.log.warn({ err, studyId: study.id }, "failed to delete a study's files");
    }
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
    const updated = await prisma.studyAnnotation.update({ where: { id: annotation.id }, data: { text } });
    try {
      await releaseStudyFiles(filesFor(req), annotation.studyId, removedFileNames(annotation.text, text)); // e.g. the clip was edited out of the note
    } catch (err) {
      req.log.warn({ err, annotationId: annotation.id }, "note file cleanup failed");
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/study-annotations/:id", { preHandler: requireAuth }, async (req, reply) => {
    const annotation = await prisma.studyAnnotation.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
    if (!annotation) return reply.code(404).send({ error: "no such annotation" });
    if (annotation.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
    await prisma.studyAnnotation.delete({ where: { id: annotation.id } });
    try {
      // the note's spectrogram goes with it; its audio file stays if the text or another note still uses it
      await releaseStudyFiles(filesFor(req), annotation.studyId, uploadedFileNames(annotation.text));
    } catch (err) {
      req.log.warn({ err, annotationId: annotation.id }, "note file cleanup failed");
    }
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

  app.post<{ Params: { slug: string }; Body: { title: string; kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel?: string; yLabel?: string; xLog?: boolean; yLog?: boolean; dataCsv: string } }>(
    "/api/studies/:slug/charts",
    { preHandler: requireAuth },
    async (req, reply) => {
      const study = await prisma.study.findUnique({ where: { slug: req.params.slug }, include: { charts: true } });
      if (!study) return reply.code(404).send({ error: "no such study" });
      if (study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      const { title, kind, xLabel, yLabel, xLog, yLog, dataCsv } = req.body ?? {};
      if (!title?.trim() || !dataCsv?.trim()) return reply.code(400).send({ error: "title and dataCsv are required" });
      const nextPosition = study.charts.length + 1;
      const chart = await prisma.studyChart.create({
        data: { studyId: study.id, position: nextPosition, title: title.trim(), kind: kind ?? "LINE", xLabel: xLabel?.trim() || null, yLabel: yLabel?.trim() || null, xLog: xLog === true, yLog: yLog === true, dataCsv },
      });
      return reply.code(201).send(chart);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; kind: "LINE" | "BAR" | "SCATTER" | "TABLE"; xLabel: string | null; yLabel: string | null; xLog: boolean; yLog: boolean; dataCsv: string }> }>(
    "/api/study-charts/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const chart = await prisma.studyChart.findUnique({ where: { id: Number(req.params.id) }, include: { study: true } });
      if (!chart) return reply.code(404).send({ error: "no such chart" });
      if (chart.study.ownerId !== req.user!.id && !req.user!.isAdmin) return reply.code(403).send({ error: "not your study" });
      // whitelist: the raw body could otherwise move a chart to another study (studyId) or change its position
      const { title, kind, xLabel, yLabel, xLog, yLog, dataCsv } = req.body ?? {};
      const data: Record<string, unknown> = {};
      if (typeof title === "string" && title.trim()) data.title = title.trim();
      if (kind === "LINE" || kind === "BAR" || kind === "SCATTER" || kind === "TABLE") data.kind = kind;
      if (xLabel === null || typeof xLabel === "string") data.xLabel = xLabel?.trim() || null;
      if (yLabel === null || typeof yLabel === "string") data.yLabel = yLabel?.trim() || null;
      if (typeof xLog === "boolean") data.xLog = xLog;
      if (typeof yLog === "boolean") data.yLog = yLog;
      if (typeof dataCsv === "string" && dataCsv.trim()) data.dataCsv = dataCsv;
      return prisma.studyChart.update({ where: { id: chart.id }, data });
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
