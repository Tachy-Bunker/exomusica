import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export async function siteSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/site-settings", async () => {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 }, include: { defaultFont: true } });
    return settings ?? { id: 1, defaultFontId: null, defaultFont: null };
  });

  app.patch<{ Body: { defaultFontId: number | null } }>(
    "/api/admin/site-settings",
    { preHandler: requireAdmin },
    async (req) => {
      return prisma.siteSettings.upsert({
        where: { id: 1 },
        create: { id: 1, defaultFontId: req.body?.defaultFontId ?? null },
        update: { defaultFontId: req.body?.defaultFontId ?? null },
      });
    },
  );
}
