import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/notifications", { preHandler: requireAuth }, async (req) => {
    return prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
  });

  app.post("/api/notifications/read-all", { preHandler: requireAuth }, async (req) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
    return { status: "ok" };
  });

  // Resolved per-event sound: the user's own override if they have one
  // (including an explicit mute), otherwise the event's admin-set default.
  app.get("/api/account/sound-prefs", { preHandler: requireAuth }, async (req) => {
    const events = await prisma.notificationEvent.findMany({ include: { defaultSound: true } });
    const overrides = await prisma.userSoundPref.findMany({
      where: { userId: req.user!.id },
      include: { sound: true },
    });
    const overrideByEvent = new Map(overrides.map((o) => [o.eventId, o]));

    return events.map((e) => {
      const override = overrideByEvent.get(e.id);
      const resolved = override ? override.sound : e.defaultSound;
      return {
        eventId: e.id,
        key: e.key,
        label: e.label,
        hasOverride: !!override,
        soundId: resolved?.id ?? null,
        soundUrl: resolved?.fileUrl ?? null,
      };
    });
  });

  app.put<{ Params: { eventId: string }; Body: { soundId: number | null } }>(
    "/api/account/sound-prefs/:eventId",
    { preHandler: requireAuth },
    async (req) => {
      const eventId = Number(req.params.eventId);
      await prisma.userSoundPref.upsert({
        where: { userId_eventId: { userId: req.user!.id, eventId } },
        create: { userId: req.user!.id, eventId, soundId: req.body?.soundId ?? null },
        update: { soundId: req.body?.soundId ?? null },
      });
      return { status: "ok" };
    },
  );

  // Removes the override entirely, reverting to "use the event's default".
  app.delete<{ Params: { eventId: string } }>(
    "/api/account/sound-prefs/:eventId",
    { preHandler: requireAuth },
    async (req) => {
      await prisma.userSoundPref.deleteMany({ where: { userId: req.user!.id, eventId: Number(req.params.eventId) } });
      return { status: "ok" };
    },
  );
}
