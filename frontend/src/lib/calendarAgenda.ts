// The agenda's period (fix415): the next 30 days by default, this week, next week, or a number of days typed in. Pure: day keys in and out.
import { addDays, weekStart } from "./calendarTime";

export type AgendaChoice = "30" | "week" | "next";
/** The longest period the agenda takes, in days. */
export const AGENDA_MAX_DAYS = 366;

/** The number the box says, when it is a whole number of days from 1 to the longest period; otherwise null. */
export function customDays(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= AGENDA_MAX_DAYS ? n : null;
}

/** The days the agenda shows, as [first day, day after the last): a typed number of days wins, then the chosen period. Weeks start on Monday. */
export function agendaSpan(today: string, choice: AgendaChoice, custom: string): [string, string] {
  const n = customDays(custom);
  if (n !== null) return [today, addDays(today, n)];
  if (choice === "week") return [today, addDays(weekStart(today), 7)];
  if (choice === "next") {
    const monday = addDays(weekStart(today), 7);
    return [monday, addDays(monday, 7)];
  }
  return [today, addDays(today, 30)];
}
