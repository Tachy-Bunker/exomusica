/** Deadlines and follow-ups as a calendar file (.ics) any phone calendar opens. All-day events, with reminders 7 and 2 days before a deadline. Pure. */
import type { Contact } from "../components/outreach/types";

const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; } cur += ch; bytes += b; }
  out.push(cur); return out.join("\r\n ");
}
const compact = (d: string): string => d.replace(/-/g, "");
const nextDay = (d: string): string => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

export function toIcs(contacts: Contact[], now = new Date(), host = "exomusica"): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Exomusica//Outreach//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Outreach"];
  const event = (uid: string, date: string, title: string, desc: string, alarms: number[]) => {
    lines.push("BEGIN:VEVENT", `UID:${uid}@${host}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(nextDay(date))}`, `SUMMARY:${esc(title)}`);
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    for (const d of alarms) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, `TRIGGER:-P${d}D`, "END:VALARM");
    lines.push("END:VEVENT");
  };
  for (const c of contacts) {
    const who = c.name || c.email || `#${c.id}`; const done = ["accepted", "declined", "replied"].includes(c.status);
    if (c.deadline && !done) event(`deadline-${c.id}`, c.deadline, `Closes: ${who}`, [c.place, c.email].filter(Boolean).join(" · "), [7, 2]);
    if (c.followUpAt && !done) event(`followup-${c.id}`, c.followUpAt, `Follow up: ${who}`, c.snoozeReason || "", []);
    if (c.reopensAt) event(`reopens-${c.id}`, c.reopensAt, `Reopens: ${who}`, "A call that comes back every year", [7]);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
