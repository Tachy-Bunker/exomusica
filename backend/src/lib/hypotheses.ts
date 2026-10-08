/** The hypothesis basket: pure rules (statuses, tallies, the exact binomial test, input cleaning). */

export const STATUSES = ["open", "testing", "supported", "contested", "refuted", "inconclusive"] as const;
export type HypStatus = (typeof STATUSES)[number];
export const RESOLVED: HypStatus[] = ["supported", "refuted", "inconclusive"];
export const PICKS = ["claim", "other", "unsure"] as const;
export type Pick = (typeof PICKS)[number];

export interface Tally { n: number; claim: number; other: number; unsure: number; informative: number; share: number | null; p: number | null }

/** Exact two-sided binomial test against chance (0.5). Sums every outcome at most as likely as the one seen. */
export function binomP(k: number, n: number): number {
  if (n <= 0) return 1;
  // log-pmf for p = 0.5: C(n,i) / 2^n, built iteratively to avoid overflow
  const pmf: number[] = [];
  let c = 1;
  for (let i = 0; i <= n; i++) { pmf.push(c / 2 ** n); c = (c * (n - i)) / (i + 1); }
  const seen = pmf[Math.max(0, Math.min(n, k))];
  let p = 0;
  for (const x of pmf) if (x <= seen * (1 + 1e-9)) p += x;
  return Math.min(1, p);
}

export function tally(picks: Iterable<string>): Tally {
  let claim = 0, other = 0, unsure = 0;
  for (const p of picks) { if (p === "claim") claim++; else if (p === "other") other++; else unsure++; }
  const informative = claim + other;
  return { n: claim + other + unsure, claim, other, unsure, informative, share: informative ? claim / informative : null, p: informative ? binomP(claim, informative) : null };
}

/** A suggestion only: the author decides. Contested is always a human call. */
export function suggestStatus(t: Tally): HypStatus {
  if (t.n === 0) return "open";
  if (t.informative < 10 || t.p === null || t.share === null) return "testing";
  if (t.p < 0.05) return t.share > 0.5 ? "supported" : "refuted";
  if (t.informative >= 30 && t.p > 0.3) return "inconclusive";
  return "testing";
}

/** Normalises what a participant tapped into the hypothesis's own terms. Stimuli are shown in random order; "first"/"second" are what was on screen. */
export function normalisePick(pick: string, swapped: boolean): Pick | null {
  if (pick === "unsure" || pick === "claim" || pick === "other") return pick;
  if (pick !== "first" && pick !== "second") return null;
  // the hypothesis predicts A. Not swapped: first = A. Swapped: first = B.
  const pickedA = (pick === "first") !== swapped;
  return pickedA ? "claim" : "other";
}

const clip = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

export interface HypInput { title: string; claim: string; protocol: string; requirements: string[]; question: string | null }
export function cleanHypothesis(b: Record<string, unknown>): { ok: true; v: HypInput } | { ok: false; error: string } {
  const title = clip(b.title, 120);
  const claim = clip(b.claim, 600);
  const protocol = clip(b.protocol, 4000);
  if (!title) return { ok: false, error: "Give it a short title." };
  if (!claim) return { ok: false, error: "State the claim: one sentence that a test could show wrong." };
  if (!protocol) return { ok: false, error: "Say how to test it: what to listen for or do, and what counts as yes." };
  const raw = Array.isArray(b.requirements) ? b.requirements : String(b.requirements ?? "").split(/[,\n]/);
  const requirements = [...new Set(raw.map((r) => clip(r, 60)).filter(Boolean))].slice(0, 8);
  return { ok: true, v: { title, claim, protocol, requirements, question: clip(b.question, 160) || null } };
}

export function cleanNote(v: unknown): string | null { return clip(v, 280) || null; }

/** Pays the author when a hypothesis is settled by enough informative answers (not their own). */
export const AUTHOR_BONUS = 5;
export const MIN_FOR_BONUS = 20;
export const DAILY_TRIAL_POINTS = 5;
