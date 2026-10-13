export interface BuddyCandidate { id: number; pending: number; lastActiveAt: number | null }

/** Who greets a newcomer: members who were active recently first, then whoever has the fewest greetings waiting, then at random so it isn't always the same person. */
export function pickBuddy(cands: BuddyCandidate[], now: number, rand: () => number = Math.random): number | null {
  if (cands.length === 0) return null;
  const recent = cands.filter((c) => c.lastActiveAt != null && now - c.lastActiveAt < 45 * 86_400_000);
  const pool = recent.length > 0 ? recent : cands;
  const least = Math.min(...pool.map((c) => c.pending));
  const tied = pool.filter((c) => c.pending === least).sort((a, b) => a.id - b.id);
  return tied[Math.floor(rand() * tied.length) % tied.length].id;
}

export const welcomeText = (username: string): string => `Welcome @${username} !`;

/** A link into a chat that opens with the greeting already in the box. */
export function welcomeLink(base: string, channelSlug: string, username: string): string {
  return `${base.replace(/\/$/, "")}/topic/${encodeURIComponent(channelSlug)}?say=${encodeURIComponent(welcomeText(username))}`;
}
