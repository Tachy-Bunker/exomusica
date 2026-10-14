// Database side of the milestones; the catalogue and the pure resolving are in milestonesCore.ts.
import { prisma } from "./prisma.js";
import { getSiteStats } from "./siteStats.js";
import type { SiteStats } from "./newsTokens.js";
import { MILESTONES, METRIC_LABEL, resolveMilestones, type MilestoneState } from "./milestonesCore.js";
export * from "./milestonesCore.js";

const TTL = 60_000;
let cached: { at: number; p: Promise<MilestoneState[]> } | null = null;
export function forgetMilestones(): void { cached = null; }

async function compute(): Promise<MilestoneState[]> {
  const [stats, rows] = await Promise.all([getSiteStats(), prisma.milestoneSetting.findMany()]);
  const state = resolveMilestones(MILESTONES, rows, stats.totals);
  const had = new Map(rows.map((r) => [r.key, r.reachedAt]));
  // Remember when each was first reached (and forget it if an admin raised the target past where we stand). Writes only on change.
  for (const m of state) {
    const was = had.get(m.key) ?? null;
    if (m.reached && !was) await prisma.milestoneSetting.upsert({ where: { key: m.key }, create: { key: m.key, reachedAt: m.reachedAt }, update: { reachedAt: m.reachedAt } }).catch(() => undefined);
    else if (!m.reached && was) await prisma.milestoneSetting.update({ where: { key: m.key }, data: { reachedAt: null } }).catch(() => undefined);
  }
  return state;
}

/** Computed once a minute however many readers ask. Disabled milestones are included; callers filter. */
export function getMilestones(): Promise<MilestoneState[]> {
  if (!cached || Date.now() - cached.at > TTL) {
    const p = compute();
    cached = { at: Date.now(), p };
    p.catch(() => { if (cached?.p === p) cached = null; });
  }
  return cached.p;
}

/** Site stats plus the milestone numbers, for {{MTARGET:key}}, {{MNOW:key}}, {{MTOGO:key}} in News. */
export async function getTokenStats(): Promise<SiteStats> {
  const [stats, ms] = await Promise.all([getSiteStats(), getMilestones()]);
  return { ...stats, milestones: Object.fromEntries(ms.map((m) => [m.key, { target: m.target, now: m.now }])) };
}

export const publicShape = (m: MilestoneState) => ({
  key: m.key, title: m.title, perk: m.perk, metric: m.metric, label: METRIC_LABEL[m.metric], target: m.target, now: m.now, reached: m.reached,
  reachedAt: m.reachedAt ? m.reachedAt.toISOString() : null, live: m.live, ...(m.frame ? { frame: m.frame } : {}),
});
