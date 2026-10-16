// Monthly challenge: the bar, what each member has put in, and the brief shown. Database side; the rules are in monthlyCore.ts.
import { prisma } from "./prisma.js";
import { getMilestones } from "./milestones.js";
import { barUnits, briefFor, canListen, canRun, dayKey, isDown, monthKey, nextMonth, RUN_UNITS, LISTEN_GAP_MS, type ShownBrief } from "./monthlyCore.js";

const NOT_HIDDEN = { visibility: { not: "HIDDEN" as const } };

/** The first month of the challenge: the month the community reached the milestone. Null until then, or while the milestone is switched off. */
export async function openMonth(): Promise<string | null> {
  const m = (await getMilestones()).find((x) => x.key === "m-monthly");
  return m?.enabled && m.reached && m.reachedAt ? monthKey(m.reachedAt) : null;
}

async function totals(month: string): Promise<{ listen: number; run: number }> {
  const a = await prisma.monthlyContribution.aggregate({ where: { month }, _sum: { listenUnits: true, runUnits: true } });
  return { listen: a._sum.listenUnits ?? 0, run: a._sum.runUnits ?? 0 };
}

/** Keeps a written brief's "down" date in step with the bar: set when it first fills, cleared if the goal is raised above it. */
async function settle(month: string): Promise<void> {
  const row = await prisma.monthlyBoss.findUnique({ where: { month }, select: { goalUnits: true, downAt: true } });
  if (!row) return;
  const t = await totals(month);
  const down = isDown(barUnits(t.listen, t.run), row.goalUnits);
  if (down && !row.downAt) await prisma.monthlyBoss.update({ where: { month }, data: { downAt: new Date() } });
  else if (!down && row.downAt) await prisma.monthlyBoss.update({ where: { month }, data: { downAt: null } });
  pub = null;
}

export interface MonthlyPublic {
  open: boolean; month: string; openMonth: string | null;
  boss: null | { source: "written" | "temporary"; title: string; brief: string; rule: string; trackId: number | null; trackTitle: string | null; goalUnits: number; downAt: string | null };
  bar: null | { units: number; goal: number; listen: number; run: number; down: boolean };
}

const PUB_TTL = 30_000;
let pub: { at: number; month: string; p: Promise<MonthlyPublic> } | null = null;

async function compute(now: Date): Promise<MonthlyPublic> {
  const month = monthKey(now);
  const open = await openMonth();
  if (!open) return { open: false, month, openMonth: null, boss: null, bar: null };
  const row = await prisma.monthlyBoss.findUnique({ where: { month } });
  const brief: ShownBrief | null = briefFor(month, open, row);
  if (!brief) return { open: true, month, openMonth: open, boss: null, bar: null };
  const t = await totals(month);
  const units = barUnits(t.listen, t.run);
  const trackTitle = brief.trackId
    ? (await prisma.track.findFirst({ where: { id: brief.trackId, album: { branch: NOT_HIDDEN } }, select: { title: true } }))?.title ?? null
    : null;
  return {
    open: true, month, openMonth: open,
    boss: { source: brief.source, title: brief.title, brief: brief.brief, rule: brief.rule, trackId: brief.trackId, trackTitle, goalUnits: brief.goalUnits, downAt: row?.downAt?.toISOString() ?? null },
    bar: { units, goal: brief.goalUnits, listen: t.listen, run: t.run, down: isDown(units, brief.goalUnits) },
  };
}

/** The public state, cached 30 seconds: the bar is one number that everyone reads. */
export function getMonthly(now = new Date()): Promise<MonthlyPublic> {
  const month = monthKey(now);
  if (!pub || pub.month !== month || Date.now() - pub.at > PUB_TTL) {
    const p = compute(now);
    pub = { at: Date.now(), month, p };
    p.catch(() => { if (pub?.p === p) pub = null; });
  }
  return pub.p;
}

export async function getMine(userId: number, now = new Date()): Promise<{ listenMinutes: number; runUnits: number; ranToday: boolean }> {
  const r = await prisma.monthlyContribution.findUnique({ where: { month_userId: { month: monthKey(now), userId } }, select: { listenUnits: true, runUnits: true, lastRunDay: true } });
  return { listenMinutes: r?.listenUnits ?? 0, runUnits: r?.runUnits ?? 0, ranToday: r?.lastRunDay === dayKey(now) };
}

/** One minute of listening to the boss track. Heartbeats closer together than the gap are ignored, so it can't be stacked. */
export async function recordListen(userId: number, trackId: number, now = new Date()): Promise<boolean> {
  const open = await openMonth();
  if (!open) return false;
  const month = monthKey(now);
  const boss = await prisma.monthlyBoss.findUnique({ where: { month }, select: { trackId: true } });
  if (!boss || boss.trackId !== trackId) return false;
  const mine = await upsertMine(month, userId);
  if (!canListen(mine.lastListenAt, now)) return false;
  // The condition is repeated in the write itself, so two heartbeats racing each other still count once.
  const r = await prisma.monthlyContribution.updateMany({
    where: { month, userId, OR: [{ lastListenAt: null }, { lastListenAt: { lt: new Date(now.getTime() - LISTEN_GAP_MS) } }] },
    data: { listenUnits: { increment: 1 }, lastListenAt: now },
  });
  if (r.count === 0) return false;
  await settle(month);
  return true;
}

/** A room boss beaten: RUN_UNITS toward the bar, once per member per UTC day. Counts for any brief shown this month. */
export async function recordRun(userId: number, now = new Date()): Promise<boolean> {
  const open = await openMonth();
  if (!open) return false;
  const month = monthKey(now);
  const brief = briefFor(month, open, await prisma.monthlyBoss.findUnique({ where: { month } }));
  if (!brief) return false;
  const mine = await upsertMine(month, userId);
  if (!canRun(mine.lastRunDay, now)) return false;
  const today = dayKey(now);
  const r = await prisma.monthlyContribution.updateMany({
    where: { month, userId, OR: [{ lastRunDay: null }, { lastRunDay: { not: today } }] },
    data: { runUnits: { increment: RUN_UNITS }, lastRunDay: today },
  });
  if (r.count === 0) return false;
  await settle(month);
  return true;
}

async function upsertMine(month: string, userId: number) {
  return prisma.monthlyContribution.upsert({
    where: { month_userId: { month, userId } }, create: { month, userId }, update: {},
    select: { lastListenAt: true, lastRunDay: true },
  });
}

/** The admin's view: the current and next month, and the archive of written briefs. */
export async function adminMonthly(now = new Date()) {
  const open = await openMonth();
  const cur = monthKey(now);
  const months = [cur, nextMonth(cur)];
  const rows = await prisma.monthlyBoss.findMany({ orderBy: { month: "desc" }, take: 24 });
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const views = await Promise.all(months.map(async (month) => {
    const row = byMonth.get(month) ?? null;
    const brief = open ? briefFor(month, open, row) : null;
    const t = await totals(month);
    const units = barUnits(t.listen, t.run);
    const trackTitle = brief?.trackId ? (await prisma.track.findFirst({ where: { id: brief.trackId }, select: { title: true } }))?.title ?? null : null;
    return { month, brief, written: !!row, trackTitle, units, down: brief ? isDown(units, brief.goalUnits) : false };
  }));
  return { openMonth: open, current: cur, months: views, archive: rows.map((r) => ({ month: r.month, title: r.title, trackId: r.trackId, goalUnits: r.goalUnits, downAt: r.downAt?.toISOString() ?? null })) };
}

export async function saveBoss(month: string, body: { title: string; brief: string; rule: string; trackId: number | null; goalUnits: number }): Promise<void> {
  await prisma.monthlyBoss.upsert({ where: { month }, create: { month, ...body }, update: body });
  pub = null;
  await settle(month);
}

