export const DIGEST_MAX_DAYS = 60;
export const DIGEST_DEFAULT_DAYS = 7;

/** The moment the digest looks back to: the given time (ms), but never before 60 days ago, never in the future, a week back when missing or nonsense. */
export function digestSince(v: unknown, now = Date.now()): Date {
  const n = Number(v);
  const floor = now - DIGEST_MAX_DAYS * 86_400_000;
  if (!Number.isFinite(n) || n <= 0) return new Date(now - DIGEST_DEFAULT_DAYS * 86_400_000);
  return new Date(Math.min(now, Math.max(floor, n)));
}

export const snippet = (s: string, n = 90): string => {
  const t = s.replace(/<[@#&]\d+>/g, "@…").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
