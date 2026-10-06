const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 min ago", "3 h ago", "yesterday", "5 days ago", then a date. */
export function timeAgo(at: number, now = Date.now()): string {
  const d = now - at;
  if (d < 45_000) return "just now";
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  if (d < 2 * DAY) return "yesterday";
  if (d < 14 * DAY) return `${Math.floor(d / DAY)} days ago`;
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}${date.getUTCFullYear() !== new Date(now).getUTCFullYear() ? ` ${date.getUTCFullYear()}` : ""}`;
}
