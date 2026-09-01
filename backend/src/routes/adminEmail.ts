import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_TOKENS,
  getTemplate,
  sendTemplatedMail,
  type EmailType,
} from "../lib/emailTemplates.js";

const ALL_TYPES = Object.keys(DEFAULT_TEMPLATES) as EmailType[];

export async function adminEmailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/email-templates", { preHandler: requireAdmin }, async () => {
    return Promise.all(
      ALL_TYPES.map(async (type) => ({
        type,
        tokens: TEMPLATE_TOKENS[type],
        isCustomized: !!(await prisma.emailTemplate.findUnique({ where: { type } })),
        ...(await getTemplate(type)),
      })),
    );
  });

  app.put<{ Params: { type: string }; Body: { subject: string; bodyHtml: string } }>(
    "/api/admin/email-templates/:type",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const type = req.params.type as EmailType;
      if (!ALL_TYPES.includes(type)) return reply.code(404).send({ error: "no such email type" });
      const { subject, bodyHtml } = req.body ?? {};
      if (!subject || !bodyHtml) return reply.code(400).send({ error: "subject and bodyHtml are required" });
      await prisma.emailTemplate.upsert({
        where: { type },
        create: { type, subject, bodyHtml },
        update: { subject, bodyHtml },
      });
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: "email_template.update", targetType: "EmailTemplate", meta: { type } },
      });
      return { type, subject, bodyHtml };
    },
  );

  // Reverts to the built-in default by deleting the override row.
  app.delete<{ Params: { type: string } }>(
    "/api/admin/email-templates/:type",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const type = req.params.type as EmailType;
      if (!ALL_TYPES.includes(type)) return reply.code(404).send({ error: "no such email type" });
      await prisma.emailTemplate.deleteMany({ where: { type } });
      return reply.code(204).send();
    },
  );

  // Calls for ideas / Calls for artists — free-text broadcasts, unlike NEWS
  // which is always tied to a published blog post. Sent to every user with
  // the matching notify flag on.
  app.post<{ Body: { type: "CALL_FOR_IDEAS" | "CALL_FOR_ARTISTS"; subject: string; body: string } }>(
    "/api/admin/broadcast",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { type, subject, body } = req.body ?? {};
      if (type !== "CALL_FOR_IDEAS" && type !== "CALL_FOR_ARTISTS") {
        return reply.code(400).send({ error: "type must be CALL_FOR_IDEAS or CALL_FOR_ARTISTS" });
      }
      if (!subject || !body) return reply.code(400).send({ error: "subject and body are required" });

      const notifyField = type === "CALL_FOR_IDEAS" ? "notifyCallsForIdeas" : "notifyCallsForArtists";
      const recipients = await prisma.user.findMany({
        where: { [notifyField]: true, isGhost: false },
        select: { username: true, email: true },
      });
      let notified = 0;
      for (const r of recipients) {
        if (!r.email) continue;
        void sendTemplatedMail(type, r.email, r.username, { subject, body: `<p>${body}</p>` }).catch((err) =>
          app.log.error(err, "sendTemplatedMail failed"),
        );
        notified++;
      }
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: "broadcast.send", targetType: "EmailType", meta: { type, notified } },
      });
      return { notified };
    },
  );
}
