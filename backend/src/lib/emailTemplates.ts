import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";

export type EmailType =
  | "WEEKLY_SUMMARY"
  | "DAILY_SUMMARY"
  | "TOPIC_REPLY"
  | "PRIVATE_MESSAGE"
  | "JOIN_APPROVED"
  | "NEWS"
  | "CALL_FOR_IDEAS"
  | "CALL_FOR_ARTISTS";

interface TemplateContent {
  subject: string;
  bodyHtml: string;
}

// {{username}} and {{date}} are always available (sendTemplatedMail fills
// them in). Each type also lists what else it gets, shown to the admin in
// the template editor so they know what's usable without guessing.
export const TEMPLATE_TOKENS: Record<EmailType, string[]> = {
  WEEKLY_SUMMARY: ["username", "date", "summary"],
  DAILY_SUMMARY: ["username", "date", "summary"],
  TOPIC_REPLY: ["username", "date", "channelName", "authorUsername", "messageExcerpt", "messageUrl"],
  PRIVATE_MESSAGE: ["username", "date", "senderUsername", "messageExcerpt"],
  JOIN_APPROVED: ["username", "date"],
  NEWS: ["username", "date", "postTitle", "postExcerpt"],
  CALL_FOR_IDEAS: ["username", "date", "subject", "body"],
  CALL_FOR_ARTISTS: ["username", "date", "subject", "body"],
};

export const DEFAULT_TEMPLATES: Record<EmailType, TemplateContent> = {
  WEEKLY_SUMMARY: {
    subject: "Your weekly Exomusica activity",
    bodyHtml: "<p>Hi {{username}},</p><p>{{summary}}</p>",
  },
  DAILY_SUMMARY: {
    subject: "Your daily Exomusica activity",
    bodyHtml: "<p>Hi {{username}},</p><p>{{summary}}</p>",
  },
  TOPIC_REPLY: {
    subject: "New activity in {{channelName}}",
    bodyHtml:
      "<p>Hi {{username}},</p><p>{{authorUsername}} posted in a topic you follow:</p><blockquote>{{messageExcerpt}}</blockquote><p><a href=\"{{messageUrl}}\">View it</a></p>",
  },
  PRIVATE_MESSAGE: {
    subject: "New message from {{senderUsername}} on Exomusica",
    bodyHtml: "<p>Hi {{username}},</p><p>{{senderUsername}} sent you a message:</p><blockquote>{{messageExcerpt}}</blockquote>",
  },
  JOIN_APPROVED: {
    subject: "You're in — Exomusica",
    bodyHtml:
      "<p>Hi {{username}},</p><p>Your Exomusica account is approved. Log in with the username and password you signed up with.</p>",
  },
  NEWS: {
    subject: "New on Exomusica: {{postTitle}}",
    bodyHtml: "<p>Hi {{username}},</p><p>{{postExcerpt}}</p>",
  },
  CALL_FOR_IDEAS: {
    subject: "{{subject}}",
    bodyHtml: "<p>Hi {{username}},</p>{{body}}",
  },
  CALL_FOR_ARTISTS: {
    subject: "{{subject}}",
    bodyHtml: "<p>Hi {{username}},</p>{{body}}",
  },
};

export async function getTemplate(type: EmailType): Promise<TemplateContent> {
  const custom = await prisma.emailTemplate.findUnique({ where: { type } });
  return custom ?? DEFAULT_TEMPLATES[type];
}

export function renderTemplate(template: TemplateContent, vars: Record<string, string>): TemplateContent {
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
  return { subject: fill(template.subject), bodyHtml: fill(template.bodyHtml) };
}

/** The one function call sites should use — looks up the (possibly
 *  admin-edited) template, fills in username/date plus whatever the type
 *  needs, and sends both an HTML body and a crude tag-stripped plaintext
 *  fallback for clients that want it. */
export async function sendTemplatedMail(
  type: EmailType,
  to: string,
  username: string,
  vars: Record<string, string> = {},
): Promise<void> {
  const template = await getTemplate(type);
  const { subject, bodyHtml } = renderTemplate(template, {
    username,
    date: new Date().toLocaleDateString(),
    ...vars,
  });
  const text = bodyHtml.replace(/<[^>]+>/g, "");
  await sendMail(to, subject, text, bodyHtml);
}
