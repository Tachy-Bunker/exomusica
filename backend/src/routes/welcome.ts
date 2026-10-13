import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { welcomeChannelSlug } from "../lib/welcomeAssign.js";
import { welcomeText } from "../lib/welcomeBuddy.js";

/** The greetings a member was asked to make, for the prompt on Home. They fade after two weeks. */
export async function welcomeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/welcome/pending", { preHandler: requireAuth }, async (req) => {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const rows = await prisma.welcomeBuddy.findMany({ where: { buddyId: req.user!.id, doneAt: null, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, newUser: { select: { username: true } } } });
    const channel = await welcomeChannelSlug();
    return rows.map((r) => ({ id: r.id, username: r.newUser.username, say: welcomeText(r.newUser.username), channelSlug: channel }));
  });

  app.post<{ Params: { id: string } }>("/api/welcome/:id/done", { preHandler: requireAuth }, async (req) => {
    await prisma.welcomeBuddy.updateMany({ where: { id: Number(req.params.id) || 0, buddyId: req.user!.id, doneAt: null }, data: { doneAt: new Date() } });
    return { ok: true };
  });
}
