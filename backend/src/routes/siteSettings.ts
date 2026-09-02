import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSoundFile } from "../lib/storage.js";

export async function siteSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/site-settings", async () => {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
      include: { defaultFont: true, defaultWikiPage: { select: { slug: true } } },
    });
    return (
      settings ?? {
        id: 1,
        defaultFontId: null,
        defaultFont: null,
        ambienceUrl: null,
        scanSfxUrl: null,
        defaultWikiPage: null,
        textColorPrimary: null,
        textColorSecondary: null,
        chatTitleColor: null,
        accentPrimaryColor: null,
        contentTextScaleDesktop: 2.0,
        contentTextScaleMobile: 1.6,
      }
    );
  });

  app.patch<{
    Body: Partial<{
      defaultFontId: number | null;
      defaultWikiPageId: number | null;
      textColorPrimary: string | null;
      textColorSecondary: string | null;
      chatTitleColor: string | null;
      accentPrimaryColor: string | null;
      contentTextScaleDesktop: number;
      contentTextScaleMobile: number;
    }>;
  }>("/api/admin/site-settings", { preHandler: requireAdmin }, async (req) => {
    const data: Record<string, unknown> = {};
    const body = req.body ?? {};
    for (const key of [
      "defaultFontId",
      "defaultWikiPageId",
      "textColorPrimary",
      "textColorSecondary",
      "chatTitleColor",
      "accentPrimaryColor",
      "contentTextScaleDesktop",
      "contentTextScaleMobile",
    ] as const) {
      if (key in body) data[key] = body[key];
    }
    return prisma.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  });

  app.post("/api/admin/site-settings/ambience", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, ambienceUrl: url },
        update: { ambienceUrl: url },
      });
      return { ambienceUrl: settings.ambienceUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/ambience", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ambienceUrl: null },
      update: { ambienceUrl: null },
    });
    return { status: "ok" };
  });

  app.post("/api/admin/site-settings/scan-sfx", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, scanSfxUrl: url },
        update: { scanSfxUrl: url },
      });
      return { scanSfxUrl: settings.scanSfxUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/scan-sfx", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, scanSfxUrl: null },
      update: { scanSfxUrl: null },
    });
    return { status: "ok" };
  });
}
