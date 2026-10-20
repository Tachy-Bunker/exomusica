// The calendar's last view, remembered per calendar in this browser (fix418, idea 7): the agenda's period, the number of days typed in, and
// list or sentences. It is a viewer's convenience only: the page works without it, and a stored value that is not in the expected shape
// is the default. The search is not remembered: a visit starts with the whole calendar.
import type { AgendaChoice } from "./calendarAgenda";

export type AgendaMode = "list" | "sentences";
export interface ViewPrefs { period: AgendaChoice; custom: string; mode: AgendaMode }

export const DEFAULT_VIEW: ViewPrefs = { period: "30", custom: "", mode: "list" };
const PERIODS: readonly AgendaChoice[] = ["30", "week", "next"];
const KEY = "exomusica_calendar_views";

/** What was stored, checked field by field: anything not in its shape is the default for that field. */
export function parseViewPrefs(raw: unknown): ViewPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VIEW };
  const r = raw as Record<string, unknown>;
  const period = PERIODS.includes(r.period as AgendaChoice) ? (r.period as AgendaChoice) : DEFAULT_VIEW.period;
  const custom = typeof r.custom === "string" && /^\d{0,3}$/.test(r.custom) ? r.custom : DEFAULT_VIEW.custom;
  const mode: AgendaMode = r.mode === "sentences" ? "sentences" : "list";
  return { period, custom, mode };
}

function readAll(): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** The view this browser last left the calendar in; the default when there is none (or storage is blocked). */
export function readViewPrefs(slug: string): ViewPrefs {
  try { return parseViewPrefs(readAll()[slug]); } catch { return { ...DEFAULT_VIEW }; }
}

/** Keeps the view for this calendar. A blocked store just means the default next time. */
export function writeViewPrefs(slug: string, p: ViewPrefs): void {
  try {
    const all = readAll();
    all[slug] = { period: p.period, custom: p.custom, mode: p.mode };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage blocked: the default view is shown next time */ }
}
