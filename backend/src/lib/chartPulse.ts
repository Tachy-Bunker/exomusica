// Chart layer (milestone m-chart): where members have recently looked, as anonymous pulses. No names, no counts below MIN_PEOPLE, hidden rooms never.
export const MIN_PEOPLE = 2;
export const PULSE_DAYS = 7;
export interface PulseRow { key: string; people: number }
export interface PulseBranch { id: number; slug: string; visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS"; chartHidden: boolean }

/** 1 = a few people, 2 = several, 3 = many. Nothing at all below MIN_PEOPLE, so a single member's movements can't be read off the plan. */
export function pulseLevel(people: number): 0 | 1 | 2 | 3 { return people < MIN_PEOPLE ? 0 : people < 4 ? 1 : people < 10 ? 2 : 3; }

export function buildPulses(rows: PulseRow[], branches: PulseBranch[]): Record<number, number> {
  const bySlug = new Map(branches.filter((b) => b.visibility !== "HIDDEN" && !b.chartHidden).map((b) => [b.slug, b.id]));
  const out: Record<number, number> = {};
  for (const r of rows) {
    if (!r.key.startsWith("branch:")) continue;
    const id = bySlug.get(r.key.slice(7)); const lv = pulseLevel(r.people);
    if (id != null && lv > 0) out[id] = lv;
  }
  return out;
}
