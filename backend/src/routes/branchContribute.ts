import type { FastifyInstance } from "fastify";
import { ZipArchive } from "archiver";
import path from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function branchContributeRoutes(app: FastifyInstance): Promise<void> {
  // Public: every branch's contribution info for "Choose your next project"
  app.get("/api/contribute/branches", async () => {
    const branches = await prisma.branch.findMany({
      where: { visibility: "VISIBLE" },
      select: {
        slug: true,
        name: true,
        description: true,
        coverArtUrl: true,
        briefMarkdown: true,
        previewAttachment: { select: { storagePath: true } },
        _count: { select: { sketches: true } },
      },
      orderBy: { name: "asc" },
    });
    return branches.map((b) => ({
      slug: b.slug,
      name: b.name,
      description: b.description,
      coverArtUrl: b.coverArtUrl,
      hasBrief: !!b.briefMarkdown,
      previewUrl: b.previewAttachment ? b.previewAttachment.storagePath : null,
      sketchCount: b._count.sketches,
    }));
  });

  app.get<{ Params: { slug: string } }>("/api/contribute/branches/:slug", async (req, reply) => {
    const branch = await prisma.branch.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, slug: true, name: true, description: true, briefMarkdown: true, previewAttachment: { select: { storagePath: true } } },
    });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    return branch;
  });

  app.get<{ Params: { slug: string } }>("/api/contribute/branches/:slug/brief", async (req, reply) => {
    const branch = await prisma.branch.findUnique({ where: { slug: req.params.slug }, select: { name: true, briefMarkdown: true } });
    if (!branch || !branch.briefMarkdown) return reply.code(404).send({ error: "no brief available" });
    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${branch.name.replace(/[^a-z0-9-]+/gi, "-")}-brief.md"`);
    return branch.briefMarkdown;
  });

  app.get<{ Params: { slug: string } }>("/api/contribute/branches/:slug/sketches.zip", async (req, reply) => {
    const branch = await prisma.branch.findUnique({
      where: { slug: req.params.slug },
      select: { name: true, sketches: { include: { attachment: true } } },
    });
    if (!branch) return reply.code(404).send({ error: "no such branch" });
    if (branch.sketches.length === 0) return reply.code(404).send({ error: "no sketches curated for this branch yet" });

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${branch.name.replace(/[^a-z0-9-]+/gi, "-")}-sketches.zip"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    reply.send(archive);
    for (const sketch of branch.sketches) {
      const storagePath = sketch.attachment.storagePath;
      if (!storagePath.startsWith("/uploads/")) continue; // external URLs aren't archivable this way
      const diskPath = path.join(UPLOADS_DIR, storagePath.slice("/uploads/".length));
      if (existsSync(diskPath)) archive.append(createReadStream(diskPath), { name: sketch.attachment.filename });
    }
    await archive.finalize();
  });

  // --- Admin: curate sketches for a branch ---

  app.get<{ Params: { id: string } }>("/api/admin/branches/:id/sketches", { preHandler: requireAdmin }, async (req) => {
    return prisma.branchSketch.findMany({
      where: { branchId: Number(req.params.id) },
      include: { attachment: { select: { id: true, filename: true, storagePath: true, mimeType: true } } },
      orderBy: { addedAt: "desc" },
    });
  });

  app.post<{ Params: { id: string }; Body: { attachmentId: number } }>(
    "/api/admin/branches/:id/sketches",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const branchId = Number(req.params.id);
      const { attachmentId } = req.body ?? {};
      if (!attachmentId) return reply.code(400).send({ error: "attachmentId is required" });
      const existing = await prisma.branchSketch.findUnique({ where: { attachmentId } });
      if (existing) return reply.code(409).send({ error: "this attachment is already curated as a sketch" });
      const sketch = await prisma.branchSketch.create({ data: { branchId, attachmentId } });
      return reply.code(201).send(sketch);
    },
  );

  app.delete<{ Params: { sketchId: string } }>("/api/admin/branch-sketches/:sketchId", { preHandler: requireAdmin }, async (req) => {
    await prisma.branchSketch.delete({ where: { id: Number(req.params.sketchId) } });
    return { ok: true };
  });

  // Lets the admin browse a branch's own discussion channel for
  // attachments to curate as sketches, rather than needing to already
  // know an attachment's id.
  app.get<{ Params: { id: string } }>("/api/admin/branches/:id/channel-attachments", { preHandler: requireAdmin }, async (req, reply) => {
    const branch = await prisma.branch.findUnique({ where: { id: Number(req.params.id) }, select: { channel: { select: { id: true } } } });
    if (!branch?.channel) return reply.code(404).send({ error: "this branch has no discussion channel" });
    const attachments = await prisma.attachment.findMany({
      where: { message: { channelId: branch.channel.id } },
      select: { id: true, filename: true, storagePath: true, mimeType: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return attachments;
  });
}
