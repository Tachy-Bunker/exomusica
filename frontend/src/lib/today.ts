/** The "Today" list: what to do next, from the sheet alone. Pure. */
import type { Contact, Group } from "../components/outreach/types";
import { daysBetween, isDue } from "./outreachSheet";

const ENDED = new Set(["accepted", "declined", "replied"]);
export interface LadderRung { contact: Contact; tier: 7 | 2; days: number }
export interface TodayLists { followUps: Contact[]; deadlines: Contact[]; fresh: Contact[]; ghostable: Contact[]; ladder: LadderRung[]; reopening: Contact[] }
/** Follow-ups due (oldest first); open-call deadlines within `horizon` days not yet answered (soonest first); the next never-written-to people in a group; and people who were written to long ago and never answered. */
export function todayLists(contacts: Contact[], today: string, opts: { group?: number | null; horizon?: number; freshMax?: number; ghostDays?: number } = {}): TodayLists {
  const horizon = opts.horizon ?? 14, freshMax = opts.freshMax ?? 5, ghostDays = opts.ghostDays ?? 45;
  const followUps = contacts.filter((c) => isDue(c, today) && !ENDED.has(c.status)).sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? ""));
  const deadlines = contacts.filter((c) => c.deadline && !ENDED.has(c.status) && c.status !== "ghosted" && daysBetween(today, c.deadline) >= -1 && daysBetween(today, c.deadline) <= horizon).sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const fresh = contacts.filter((c) => c.sentCount === 0 && c.email && (c.status === "" || c.status === "lead") && (opts.group == null || c.groups.includes(opts.group)) && !(c.deadline && daysBetween(today, c.deadline) < 0)).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")).slice(0, freshMax);
  const ghostable = contacts.filter((c) => c.status === "contacted" && c.lastSentAt && daysBetween(c.lastSentAt, today) >= ghostDays).sort((a, b) => (a.lastSentAt ?? "").localeCompare(b.lastSentAt ?? "")).slice(0, 8);
  // the countdown ladder: a call you haven't written to yet reminds you at 7 days and again at 2, whatever follow-up date you set
  const ladder: LadderRung[] = contacts.filter((c) => c.deadline && c.sentCount === 0 && (c.status === "" || c.status === "lead") && !c.doNotContact).flatMap((c) => {
    const days = daysBetween(today, c.deadline as string); return days >= 0 && days <= 7 ? [{ contact: c, tier: (days <= 2 ? 2 : 7) as 7 | 2, days }] : [];
  }).sort((a, b) => a.days - b.days);
  const reopening = contacts.filter((c) => c.reopensAt && daysBetween(today, c.reopensAt) >= 0 && daysBetween(today, c.reopensAt) <= 30).sort((a, b) => (a.reopensAt ?? "").localeCompare(b.reopensAt ?? ""));
  return { followUps, deadlines, fresh, ghostable, ladder, reopening };
}
export const groupNames = (c: Contact, groups: Group[]): string[] => c.groups.map((id) => groups.find((g) => g.id === id)?.name).filter((x): x is string => !!x);

/** The text a follow-up opens with: a short nudge above the quoted earlier mail. */
export function followUpDraft(prev: { subject: string; bodyMd: string; sentAt: string }): { subject: string; body: string } {
  const quoted = prev.bodyMd.trim().split("\n").map((l) => `> ${l}`).join("\n");
  return {
    subject: /^re:/i.test(prev.subject) ? prev.subject : `Re: ${prev.subject}`,
    body: `Dear {{first_name|there}},\n\nI'm following up on my message of ${prev.sentAt} in case it got buried. I'd be glad to send anything else that would help, and I'm happy to answer any questions.\n\nThank you for your time.\n\n${quoted}\n`,
  };
}

/** "14 after their September programming" -> 14 days with that reason; "after August" -> a week with that reason; "" -> a week, no reason. */
export function parseSnooze(input: string, today: string): { until: string; reason: string } {
  const clean = (r: string) => r.replace(/^[\s\-–—:,]+/, "").trim().slice(0, 120);
  const iso = /^\s*(\d{4}-\d{2}-\d{2})\b(.*)$/.exec(input);
  if (iso && !Number.isNaN(Date.parse(iso[1]))) return { until: iso[1], reason: clean(iso[2]) };
  const m = /^\s*(\d{1,3})\s*(d|days?|w|weeks?)?\b\s*(.*)$/i.exec(input);
  const n = m ? Math.min(365, Math.max(1, Number(m[1]) * (m[2] && /^w/i.test(m[2]) ? 7 : 1))) : 7;
  const reason = clean(m ? m[3] : input);
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return { until: d.toISOString().slice(0, 10), reason };
}
