/** What a person can be credited for on a track. An empty list means the plain, default credit: composer. */
export const CREDIT_ROLES = ["composer", "lyrics", "vocals", "instrument", "field recording", "mixing", "mastering", "artwork"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export function cleanRoles(v: unknown): CreditRole[] {
  if (!Array.isArray(v)) return [];
  const out: CreditRole[] = [];
  for (const r of v) if (typeof r === "string" && (CREDIT_ROLES as readonly string[]).includes(r) && !out.includes(r as CreditRole)) out.push(r as CreditRole);
  return out.slice(0, 6);
}

/** How often someone is credited in each role, most frequent first. A credit with no roles counts as composer. */
export function roleSummary(credits: { roles: string[] }[]): { role: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of credits) for (const r of c.roles.length ? c.roles : ["composer"]) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}
