import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { saveSoundFile, saveSiteImage } from "../lib/storage.js";
import { verifySmtpConnection } from "../lib/mailer.js";
import { restartDiscordBotIfNeeded } from "../lib/discordBot.js";

export async function siteSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/site-settings", async () => {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
      select: {
        id: true,
        defaultFontId: true,
        defaultFont: true,
        ambienceUrl: true,
        scanSfxUrl: true,
        defaultWikiPage: { select: { slug: true } },
        textColorPrimary: true,
        textColorSecondary: true,
        chatTitleColor: true,
        accentPrimaryColor: true,
        contentTextScaleDesktop: true,
        contentTextScaleMobile: true,
        caInitial: true,
        caBurst: true,
        moireImageUrl: true,
        moireOpacity: true,
        moireSize: true,
        moireOffsetMin: true,
        moireOffsetMax: true,
        moireOffsetSpeed: true,
        moireWaveform: true,
        moireRotationSpeed: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpFrom: true,
        // smtpPassword and discordBotToken deliberately excluded — this is a
        // public, unauthenticated endpoint
        chatOpenSfxUrl: true,
        joinNotifyEmail: true,
        chatHudRevealRate: true,
        chatHudSfxUrl: true,
        chatSplashMessages: true,
        categoryOrder: true,
        linkClickSfxUrl: true,
      },
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
        caInitial: 0.15,
        caBurst: 0.6,
        moireImageUrl: null,
        moireOpacity: 0.15,
        moireSize: 1,
        moireOffsetMin: 0,
        moireOffsetMax: 20,
        moireOffsetSpeed: 0.3,
        moireWaveform: "sine",
        moireRotationSpeed: 0.1,
        smtpHost: null,
        smtpPort: null,
        smtpUser: null,
        smtpFrom: null,
        chatOpenSfxUrl: null,
        joinNotifyEmail: null,
        chatHudRevealRate: 30,
        chatHudSfxUrl: null,
        chatSplashMessages: [],
        categoryOrder: [],
        linkClickSfxUrl: null,
      }
    );
  });

  // Admin-only view — includes whether a password is set (as a boolean,
  // never the value itself) so the form can show "configured" without
  // ever round-tripping the actual secret back to the browser.
  app.get("/api/admin/discord-bridge/status", { preHandler: requireAdmin }, async () => {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    return { discordBotTokenSet: !!settings?.discordBotToken };
  });

  app.get("/api/admin/site-settings/smtp", { preHandler: requireAdmin }, async () => {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    return {
      smtpHost: settings?.smtpHost ?? null,
      smtpPort: settings?.smtpPort ?? null,
      smtpUser: settings?.smtpUser ?? null,
      smtpFrom: settings?.smtpFrom ?? null,
      smtpPasswordSet: !!settings?.smtpPassword,
    };
  });

  app.put<{
    Body: { smtpHost: string | null; smtpPort: number | null; smtpUser: string | null; smtpPassword?: string; smtpFrom: string | null };
  }>("/api/admin/site-settings/smtp", { preHandler: requireAdmin }, async (req) => {
    const data: Record<string, unknown> = {
      smtpHost: req.body.smtpHost,
      smtpPort: req.body.smtpPort,
      smtpUser: req.body.smtpUser,
      smtpFrom: req.body.smtpFrom,
    };
    // Only overwrite the password if a new one was actually typed — an
    // empty field means "leave the existing one alone", not "clear it".
    if (req.body.smtpPassword) data.smtpPassword = req.body.smtpPassword;
    await prisma.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    if ("discordBotToken" in data) void restartDiscordBotIfNeeded();
    return { status: "ok" };
  });

  app.post("/api/admin/site-settings/smtp/test", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      await verifySmtpConnection();
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : "connection failed" });
    }
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
      caInitial: number;
      caBurst: number;
      moireOpacity: number;
      moireSize: number;
      moireOffsetMin: number;
      moireOffsetMax: number;
      moireOffsetSpeed: number;
      moireWaveform: string;
      moireRotationSpeed: number;
      joinNotifyEmail: string | null;
      chatHudRevealRate: number;
      chatSplashMessages: string[];
      categoryOrder: string[];
      discordBotToken: string | null;
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
      "caInitial",
      "caBurst",
      "moireOpacity",
      "moireSize",
      "moireOffsetMin",
      "moireOffsetMax",
      "moireOffsetSpeed",
      "moireWaveform",
      "moireRotationSpeed",
      "joinNotifyEmail",
      "chatHudRevealRate",
      "chatSplashMessages",
      "categoryOrder",
      "discordBotToken",
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

  app.post("/api/admin/site-settings/moire-image", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    if (!["image/png", "image/svg+xml"].includes(file.mimetype)) return reply.code(400).send({ error: "PNG or SVG only" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "moire");
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, moireImageUrl: url },
        update: { moireImageUrl: url },
      });
      return { moireImageUrl: settings.moireImageUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/moire-image", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, moireImageUrl: null },
      update: { moireImageUrl: null },
    });
    return { status: "ok" };
  });

  app.post("/api/admin/site-settings/chat-open-sfx", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, chatOpenSfxUrl: url },
        update: { chatOpenSfxUrl: url },
      });
      return { chatOpenSfxUrl: settings.chatOpenSfxUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/chat-open-sfx", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, chatOpenSfxUrl: null },
      update: { chatOpenSfxUrl: null },
    });
    return { status: "ok" };
  });

  app.post("/api/admin/site-settings/chat-hud-sfx", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, chatHudSfxUrl: url },
        update: { chatHudSfxUrl: url },
      });
      return { chatHudSfxUrl: settings.chatHudSfxUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/chat-hud-sfx", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, chatHudSfxUrl: null },
      update: { chatHudSfxUrl: null },
    });
    return { status: "ok" };
  });

  app.post("/api/admin/site-settings/link-click-sfx", { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSoundFile(file.filename, file.mimetype, buffer);
      const settings = await prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, linkClickSfxUrl: url },
        update: { linkClickSfxUrl: url },
      });
      return { linkClickSfxUrl: settings.linkClickSfxUrl };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete("/api/admin/site-settings/link-click-sfx", { preHandler: requireAdmin }, async () => {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, linkClickSfxUrl: null },
      update: { linkClickSfxUrl: null },
    });
    return { status: "ok" };
  });
}
