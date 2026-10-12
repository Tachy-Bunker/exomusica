import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ImapFlow } from "imapflow";

export interface MailAccount {
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPassword: string;
  fromName: string | null; fromEmail: string; replyTo: string | null;
  imapHost: string | null; imapPort: number | null; imapSecure: boolean; sentFolder: string; fileInSent: boolean;
}
export interface RawAttachment { filename: string; path: string; cid?: string }

export const fromHeader = (a: Pick<MailAccount, "fromName" | "fromEmail">): string => (a.fromName ? { name: a.fromName.replace(/["\r\n]/g, ""), address: a.fromEmail } as unknown as string : a.fromEmail);

/** One message as bytes. `keepBcc` is for the copy kept in Sent (it shows who was blind-copied); the copy that goes out never carries a Bcc header. */
export async function buildRaw(o: { from: Pick<MailAccount, "fromName" | "fromEmail" | "replyTo">; to: { email: string; name?: string }; cc: string[]; bcc: string[]; subject: string; text: string; html: string; attachments: RawAttachment[]; messageId: string; date?: Date; keepBcc?: boolean }): Promise<Buffer> {
  const mail = new MailComposer({
    from: fromHeader(o.from), to: o.to.name ? { name: o.to.name.replace(/["\r\n]/g, ""), address: o.to.email } : o.to.email, cc: o.cc, bcc: o.bcc, replyTo: o.from.replyTo ?? undefined,
    subject: o.subject.replace(/[\r\n]+/g, " "), text: o.text, html: o.html, messageId: o.messageId, date: o.date ?? new Date(),
    attachments: o.attachments.map((a) => ({ filename: a.filename, path: a.path, cid: a.cid, contentDisposition: a.cid ? "inline" : "attachment" })),
  } as never);
  const node = mail.compile(); node.keepBcc = !!o.keepBcc;
  return node.build();
}
export const messageIdFor = (fromEmail: string): string => `<${randomUUID()}@${fromEmail.split("@")[1] ?? "exomusica.local"}>`;

export function smtpTransport(a: MailAccount) {
  return nodemailer.createTransport({ host: a.smtpHost, port: a.smtpPort, secure: a.smtpSecure, auth: { user: a.smtpUser, pass: a.smtpPassword }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 });
}
export async function deliver(a: MailAccount, raw: Buffer, to: string[]): Promise<void> {
  await smtpTransport(a).sendMail({ envelope: { from: a.fromEmail, to }, raw });
}
const imapFor = (a: MailAccount) => new ImapFlow({ host: a.imapHost as string, port: a.imapPort ?? 993, secure: a.imapSecure, auth: { user: a.smtpUser, pass: a.smtpPassword }, logger: false });

/** Puts a copy in the mailbox's Sent folder, marked as read. Returns an error text instead of throwing: the mail itself has already left. */
export async function fileCopyInSent(a: MailAccount, raw: Buffer): Promise<string | null> {
  if (!a.imapHost) return "IMAP is not set up";
  const c = imapFor(a);
  try { await c.connect(); await c.append(a.sentFolder || "Sent", raw, ["\\Seen"], new Date()); return null; }
  catch (e) { return e instanceof Error ? e.message : "couldn't file it in Sent"; }
  finally { try { await c.logout(); } catch { /* already closed */ } }
}
export async function verifyAccount(a: MailAccount): Promise<{ smtp: string | null; imap: string | null | "off" }> {
  let smtp: string | null = null, imap: string | null | "off" = "off";
  try { await smtpTransport(a).verify(); } catch (e) { smtp = e instanceof Error ? e.message : "SMTP failed"; }
  if (a.imapHost) {
    imap = null; const c = imapFor(a);
    try { await c.connect(); const boxes = await c.list(); if (!boxes.some((b) => b.path === (a.sentFolder || "Sent"))) imap = `connected, but there is no folder called "${a.sentFolder || "Sent"}" (found: ${boxes.slice(0, 8).map((b) => b.path).join(", ")})`; }
    catch (e) { imap = e instanceof Error ? e.message : "IMAP failed"; }
    finally { try { await c.logout(); } catch { /* already closed */ } }
  }
  return { smtp, imap };
}
