/** Sending rules that need no database: do-not-contact, link tracking, quiet periods. */

/** The list holds addresses ("a@b.org") and whole domains ("@b.org" or "b.org"). */
export function dncHit(list: unknown, email: string): boolean {
  if (!Array.isArray(list)) return false;
  const e = email.trim().toLowerCase(), dom = e.slice(e.lastIndexOf("@") + 1);
  return list.some((x) => { if (typeof x !== "string") return false; const t = x.trim().toLowerCase(); if (!t) return false; return t.includes("@") && !t.startsWith("@") ? t === e : t.replace(/^@/, "") === dom; });
}
export function cleanDnc(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().toLowerCase().slice(0, 120)] : [])))].slice(0, 500);
}

/** Replaces web links in the mail's HTML with the tracked address; mailto and anchors stay as they are. */
export function linkifyForTracking(html: string, mk: (url: string) => string | null): string {
  return html.replace(/(<a\b[^>]*?\shref=")(https?:\/\/[^"]+)(")/gi, (whole, a: string, url: string, z: string) => { const u = url.replace(/&amp;/g, "&"); const t = mk(u); return t ? `${a}${t}${z}` : whole; });
}

/** Days since the last mail, or null when there never was one. */
export function quietDays(lastSentAt: string | null, today: string): number | null {
  if (!lastSentAt) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSentAt}T00:00:00Z`)) / 86400_000);
}

/** A public redirect may only point at real web addresses. */
export function safeRedirect(url: string): string | null {
  try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

export interface DigestContact { name: string; email: string; status: string; followUpAt: string | null; deadline: string | null; repliedAt: string | null; reopensAt: string | null; snoozeReason?: string }
const addD = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const label = (c: DigestContact): string => c.name || c.email || "(no name)";

/** Monday's note to yourself: what is due, what closes, who answered. Null when there is nothing to say. */
export function buildDigest(contacts: DigestContact[], today: string): { subject: string; bodyMd: string } | null {
  const open = (c: DigestContact) => !["replied", "accepted", "declined"].includes(c.status);
  const due = contacts.filter((c) => c.followUpAt && c.followUpAt <= today).sort((a, b) => (a.followUpAt as string).localeCompare(b.followUpAt as string));
  const closing = contacts.filter((c) => c.deadline && c.deadline >= today && c.deadline <= addD(today, 14) && open(c)).sort((a, b) => (a.deadline as string).localeCompare(b.deadline as string));
  const answered = contacts.filter((c) => c.repliedAt && c.repliedAt >= addD(today, -7));
  const reopening = contacts.filter((c) => c.reopensAt && c.reopensAt >= today && c.reopensAt <= addD(today, 30));
  if (!due.length && !closing.length && !answered.length && !reopening.length) return null;
  const sec = (title: string, rows: string[]) => (rows.length ? `**${title}**\n\n${rows.map((r) => `- ${r}`).join("\n")}\n\n` : "");
  const body = sec(`Follow-ups due (${due.length})`, due.slice(0, 25).map((c) => `${label(c)}, since ${c.followUpAt}${c.snoozeReason ? ` (${c.snoozeReason})` : ""}`))
    + sec(`Closing within 14 days (${closing.length})`, closing.slice(0, 25).map((c) => `${label(c)}, ${c.deadline}${c.status ? "" : ", not written yet"}`))
    + sec(`Answered this week (${answered.length})`, answered.slice(0, 25).map((c) => `${label(c)}, ${c.repliedAt}`))
    + sec(`Reopening within 30 days (${reopening.length})`, reopening.slice(0, 25).map((c) => `${label(c)}, ${c.reopensAt}`));
  return { subject: `Outreach this week: ${due.length} due, ${closing.length} closing`, bodyMd: body.trim() };
}

/** The Monday (UTC date) that starts the week containing `now`. */
export function weekStart(now: Date): string { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); const wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - wd * 86400_000).toISOString().slice(0, 10); }
