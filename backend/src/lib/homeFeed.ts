// The homepage's "Happening now" list: pure functions, so the ordering and limits are tested without a database.

export type ActivityKind = "chat" | "album" | "study" | "update" | "challenge" | "member";

export interface ActivityItem {
  kind: ActivityKind;
  label: string; // small heading on the card: "New album", "Chat · Resonant Glass"
  title: string;
  detail: string;
  href: string;
  at: number; // when it happened (ms since 1970); the page turns it into "12 min ago"
}

/** At most this many of each kind, so one busy area can't crowd out the rest. */
export const ACTIVITY_CAPS: Record<ActivityKind, number> = { chat: 3, album: 2, study: 2, update: 1, challenge: 1, member: 1 };
export const ACTIVITY_TOTAL = 9;

export function mergeActivity(items: ActivityItem[], caps = ACTIVITY_CAPS, total = ACTIVITY_TOTAL): ActivityItem[] {
  const used: Partial<Record<ActivityKind, number>> = {};
  return [...items]
    .sort((a, b) => b.at - a.at)
    .filter((it) => {
      const n = used[it.kind] ?? 0;
      if (n >= caps[it.kind]) return false;
      used[it.kind] = n + 1;
      return true;
    })
    .slice(0, total);
}

/** The newest message per chat, so one lively chat shows once, not three times. */
export function onePerChannel<T extends { channelSlug: string }>(newestFirst: T[]): T[] {
  const seen = new Set<string>();
  return newestFirst.filter((m) => (seen.has(m.channelSlug) ? false : (seen.add(m.channelSlug), true)));
}

const DAY = 86_400_000;
/** A study created and last touched close together is "new"; otherwise it was "updated". */
export const studyLabel = (createdAt: number, updatedAt: number) => (updatedAt - createdAt < 2 * DAY ? "New study" : "Study updated");

/** A branch's last sign of life: its newest album or its newest chat message, whichever is later. */
export function lastActiveAt(albumAt: Date | null | undefined, messageAt: Date | null | undefined): number | null {
  const times = [albumAt, messageAt].filter((d): d is Date => !!d).map((d) => d.getTime());
  return times.length ? Math.max(...times) : null;
}
