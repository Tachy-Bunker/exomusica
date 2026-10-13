import type { PlayableTrackDTO } from "./types";

export interface RadioNow {
  branch: { slug: string; name: string; channelSlug: string | null };
  track: PlayableTrackDTO;
  offset: number;
  remaining: number;
  upcoming: { id: number; title: string; albumTitle: string }[];
  blockEndsAt: number;
  serverNow: number;
}

/** How long to wait before asking again: when the song ends, never sooner than a second (a bad answer must not spin the page). */
export const nextAskMs = (remaining: number): number => Math.max(1000, Math.round(remaining * 1000));

/** "2 h 10 min" style countdown for the end of the current block. */
export function untilText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
