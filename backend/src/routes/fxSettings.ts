import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const DEFAULTS = {
  id: 1,
  debrisCount: 320,
  wardenSizeMin: 24,
  wardenSizeMax: 44,
  split: 0.4,
  chaos: 0.5,
  drift: 0.38,
  lurk: 0.45,
  bgBright: 0.5,
  bgSat: 0.5,
  bgContrast: 0.5,
  vignette: 0.5,
  wardenHue: 0,
  trailAmt: 0.4,
  wardenReveal: 0.65,
  wardenHuskBright: 0.3,
  wardenOrbBright: 0.3,
  glowHue: 280,
  glowSat: 0.6,
  glowBright: 0.45,
};

export async function fxSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/fx-settings", async (_req, reply) => {
    const settings = await prisma.fxSettings.findUnique({ where: { id: 1 } });
    reply.header("Cache-Control", "public, max-age=60");
    return settings ?? DEFAULTS;
  });

  app.put<{ Body: Partial<typeof DEFAULTS> }>("/api/admin/fx-settings", { preHandler: requireAdmin }, async (req) => {
    const data = req.body ?? {};
    // Clamp debris count server-side too — an admin typo shouldn't be able
    // to exceed what the prototype's own slider allowed.
    if (data.debrisCount !== undefined) data.debrisCount = Math.max(10, Math.min(1500, data.debrisCount));
    return prisma.fxSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  });
}
