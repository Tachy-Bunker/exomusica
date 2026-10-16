// Monthly challenge (milestone m-monthly). Pure rules: the month, what counts toward the bar, and which brief is shown.
export const RUN_UNITS = 5;
/** Listening credit: one unit (one minute) per heartbeat at least this far apart, so at most 72 an hour per member. */
export const LISTEN_GAP_MS = 50_000;
/** The first this many months of the challenge show a temporary brief when none is written. */
export const TEMP_BRIEF_MONTHS = 3;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" for a date, in UTC: the challenge changes on the 1st at 00:00 UTC. */
export const monthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
/** "YYYY-MM-DD" for a date, in UTC. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
export const nextMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Whole calendar months from one "YYYY-MM" to another: 0 for the same month, negative if `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

/** A member may add listening credit when their last credit is at least LISTEN_GAP_MS old (or there is none). */
export const canListen = (lastListenAt: Date | null, now: Date): boolean => !lastListenAt || now.getTime() - lastListenAt.getTime() >= LISTEN_GAP_MS;
/** A member's room run counts once per UTC day. */
export const canRun = (lastRunDay: string | null, now: Date): boolean => lastRunDay !== dayKey(now);

export interface BossRow { title: string; brief: string; rule: string; trackId: number | null; goalUnits: number }
export interface ShownBrief extends BossRow { source: "written" | "temporary" }

export const TEMP_BRIEFS: readonly { title: string; brief: string; rule: string; goalUnits: number }[] = [
  { title: "The Quiet Choir", brief: "Temporary brief. A choir with no mouths sings the same phrase. Listen until it stops.", rule: "Temporary rule: no rule yet. Listening alone fills the bar.", goalUnits: 300 },
  { title: "The Second Tide", brief: "Temporary brief. The tide comes back a step early. Keep up with it.", rule: "Temporary rule: a room run counts for five.", goalUnits: 500 },
  { title: "The Last Lantern", brief: "Temporary brief. One light is still on in the far room. Find out who left it.", rule: "Temporary rule: one room run per day counts.", goalUnits: 700 },
];

/** The brief a month shows: the owner's written one if there is one; otherwise, in the first three months, a temporary one; otherwise none yet. */
export function briefFor(month: string, openMonth: string, row: BossRow | null): ShownBrief | null {
  if (row) return { source: "written", title: row.title, brief: row.brief, rule: row.rule, trackId: row.trackId, goalUnits: row.goalUnits };
  const i = monthsBetween(openMonth, month);
  if (i < 0 || i >= TEMP_BRIEF_MONTHS) return null;
  return { source: "temporary", ...TEMP_BRIEFS[i], trackId: null };
}

export const barUnits = (listen: number, run: number): number => listen + run;
export const isDown = (units: number, goal: number): boolean => units >= goal;

/** The admin's form for one month. */
export function cleanBossBody(b: Record<string, unknown>): { ok: true; value: BossRow } | { ok: false; error: string } {
  const str = (v: unknown, min: number, max: number): string | undefined => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : undefined);
  const title = str(b.title, 1, 80);
  if (!title) return { ok: false, error: "title must be 1 to 80 characters" };
  const brief = str(b.brief, 1, 1200);
  if (!brief) return { ok: false, error: "brief must be 1 to 1200 characters" };
  const rule = b.rule === undefined || b.rule === null || b.rule === "" ? "" : str(b.rule, 1, 400);
  if (rule === undefined) return { ok: false, error: "rule must be at most 400 characters" };
  const trackId = b.trackId === null || b.trackId === undefined || b.trackId === "" ? null : Number(b.trackId);
  if (trackId !== null && !(Number.isInteger(trackId) && trackId > 0)) return { ok: false, error: "trackId must be a track's number, or empty" };
  const goalUnits = Number(b.goalUnits);
  if (!(Number.isInteger(goalUnits) && goalUnits >= 1 && goalUnits <= 1_000_000)) return { ok: false, error: "goalUnits must be a whole number from 1 to 1,000,000" };
  return { ok: true, value: { title, brief, rule, trackId, goalUnits } };
}
