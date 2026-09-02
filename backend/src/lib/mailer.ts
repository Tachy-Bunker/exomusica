import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";

// Falls back to environment variables (see backend/.env.example) only when
// nothing is configured in Admin → Fonts & Misc. Nothing here should ever
// contain a real credential in source.
const ENV_HOST = process.env.SMTP_HOST;
const ENV_PORT = Number(process.env.SMTP_PORT ?? 587);
const ENV_USER = process.env.SMTP_USER;
const ENV_PASSWORD = process.env.SMTP_PASSWORD;
const ENV_FROM = process.env.SMTP_FROM ?? ENV_USER;

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (settings?.smtpHost && settings?.smtpUser && settings?.smtpPassword) {
    return {
      host: settings.smtpHost,
      port: settings.smtpPort ?? 587,
      user: settings.smtpUser,
      password: settings.smtpPassword,
      from: settings.smtpFrom ?? settings.smtpUser,
    };
  }
  if (ENV_HOST && ENV_USER && ENV_PASSWORD) {
    return { host: ENV_HOST, port: ENV_PORT, user: ENV_USER, password: ENV_PASSWORD, from: ENV_FROM ?? ENV_USER };
  }
  return null;
}

function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
}

/** Sends an email if SMTP is configured; otherwise logs and no-ops. Never
 *  throws — a mail failure should never take down the request that
 *  triggered it (a PM send, a reaction, a publish). */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const config = await resolveSmtpConfig();
  if (!config) {
    console.warn(`[mailer] SMTP not configured — would have sent "${subject}" to ${to}`);
    return;
  }
  try {
    await buildTransport(config).sendMail({ from: config.from, to, subject, text, html });
  } catch (err) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err);
  }
}

/** Admin "check if it's working" button — verifies the connection without
 *  actually sending anything. Throws on failure so the route can report why. */
export async function verifySmtpConnection(): Promise<void> {
  const config = await resolveSmtpConfig();
  if (!config) throw new Error("SMTP is not configured");
  await buildTransport(config).verify();
}
