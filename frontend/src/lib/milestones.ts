import { api } from "./api";

export interface Milestone {
  key: string; title: string; perk: string; metric: string; label: string;
  target: number; now: number; reached: boolean; reachedAt: string | null;
  /** false = the reward is announced but not built yet */
  live: boolean; frame?: string;
}

// One request per minute however many cards a page holds (the server caches for the same time).
let cached: { at: number; p: Promise<Milestone[]> } | null = null;
export function loadMilestones(): Promise<Milestone[]> {
  if (!cached || Date.now() - cached.at > 60_000) {
    const p = api<Milestone[]>("/api/milestones").then((r) => (Array.isArray(r) ? r : []));
    cached = { at: Date.now(), p };
    p.catch(() => { if (cached?.p === p) cached = null; });
  }
  return cached.p;
}
export function forgetMilestones(): void { cached = null; }

/** Not yet reached, closest first. */
export const nextUp = (list: Milestone[], n: number): Milestone[] =>
  list.filter((m) => !m.reached).sort((a, b) => b.now / b.target - a.now / a.target).slice(0, n);

export const pct = (m: Pick<Milestone, "now" | "target">): number => Math.max(0, Math.min(100, Math.floor((m.now / m.target) * 100)));
