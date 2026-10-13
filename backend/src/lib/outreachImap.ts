/** Reading the INBOX for open calls. Read-only: nothing is moved, flagged or deleted, and only the call's title, link, deadline and fee are kept, never the mail. */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailAccount } from "./outreachMail.js";
import { callsFromMail } from "./outreachInbox.js";
import type { FoundCall } from "./outreachCollect.js";

export interface InboxScan { calls: FoundCall[]; scanned: number; lastUid: number; uidValidity: string }

const MAX_MAILS = 300, MAX_BYTES = 400_000, FIRST_DAYS = 30;

export async function scanInbox(a: MailAccount, opts: { folder: string; lastUid: number; uidValidity: string | null; own: Set<string>; today: string }): Promise<InboxScan> {
  if (!a.imapHost) throw new Error("IMAP is not set up for this mailbox.");
  const c = new ImapFlow({ host: a.imapHost, port: a.imapPort ?? 993, secure: a.imapSecure, auth: { user: a.smtpUser, pass: a.smtpPassword }, logger: false, socketTimeout: 90_000 });
  const calls: FoundCall[] = []; let scanned = 0;
  try {
    await c.connect();
    const lock = await c.getMailboxLock(opts.folder || "INBOX", { readOnly: true });
    try {
      const mb = c.mailbox; const validity = mb && typeof mb === "object" && "uidValidity" in mb ? String(mb.uidValidity) : "";
      const fresh = !opts.lastUid || (opts.uidValidity && validity && opts.uidValidity !== validity); // a new numbering restarts the scan
      let uids: number[];
      if (fresh) { const found = await c.search({ since: new Date(Date.now() - FIRST_DAYS * 86_400_000) }, { uid: true }); uids = (found || []).slice(-MAX_MAILS); }
      else { const found = await c.search({ uid: `${opts.lastUid + 1}:*` }, { uid: true }); uids = (found || []).filter((u) => u > opts.lastUid).slice(0, MAX_MAILS); }
      let lastUid = fresh ? 0 : opts.lastUid;
      if (uids.length) {
        for await (const m of c.fetch(uids, { uid: true, source: { maxLength: MAX_BYTES } }, { uid: true })) {
          lastUid = Math.max(lastUid, m.uid); scanned++;
          if (!m.source) continue;
          try {
            const p = await simpleParser(m.source, { skipImageLinks: true, skipTextToHtml: true });
            calls.push(...callsFromMail({ from: (p.from?.value?.[0]?.address ?? "").toLowerCase(), subject: p.subject ?? "", text: p.text ?? "", html: typeof p.html === "string" ? p.html : "", listUnsubscribe: p.headers.has("list-unsubscribe"), own: opts.own }, opts.today));
          } catch { /* one unreadable mail does not stop the scan */ }
        }
      }
      if (fresh && !uids.length) lastUid = Math.max(lastUid, (typeof mb === "object" && mb && "uidNext" in mb ? Number(mb.uidNext) - 1 : 0));
      return { calls, scanned, lastUid, uidValidity: validity };
    } finally { lock.release(); }
  } finally { try { await c.logout(); } catch { /* already closed */ } }
}
