import nodemailer from "nodemailer";

// Every value comes from the environment — see backend/.env.example for the
// exact keys. Nothing here should ever contain a real credential.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      })
    : null;

/** Sends an email if SMTP is configured; otherwise logs and no-ops. Never
 *  throws — a mail failure should never take down the request that
 *  triggered it (a PM send, a reaction, a publish). */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.warn(`[mailer] SMTP not configured — would have sent "${subject}" to ${to}`);
    return;
  }
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text });
  } catch (err) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err);
  }
}
