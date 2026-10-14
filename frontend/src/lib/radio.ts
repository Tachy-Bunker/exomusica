import type { PlayableTrackDTO } from "./types";

export type Station = "branch" | "crate" | "longwave";
export const STATIONS: { id: Station; label: string; key: string | null; blurb: string }[] = [
  { id: "branch", label: "Branch of the hour", key: null, blurb: "One branch on air at a time, the same moment for everyone. The branch changes with the time of day (UTC)." },
  { id: "crate", label: "Crate radio", key: "m-crateradio", blurb: "Public playlists, shuffled anew each day (UTC) and played through one by one. Every song is credited to its playlist." },
  { id: "longwave", label: "Long wave", key: "m-longwave", blurb: "The whole catalogue in one endless loop. Everyone is at the same point of it." },
];
export const asStation = (v: string | null): Station => (v === "crate" || v === "longwave" ? v : "branch");
export const stationUrl = (s: Station): string => (s === "branch" ? "/api/radio/now" : `/api/radio/station/${s}`);

export interface RadioNow {
  /** Only the branch station has a branch on air. */
  branch?: { slug: string; name: string; channelSlug: string | null };
  credit?: { title: string; owner: string; slug: string } | null;
  locked?: boolean;
  track: PlayableTrackDTO;
  offset: number;
  remaining: number;
  upcoming: { id: number; title: string; albumTitle: string }[];
  blockEndsAt?: number;
  serverNow: number;
}

/** How long to wait before asking again: when the song ends, never sooner than a second (a bad answer must not spin the page). */
export const nextAskMs = (remaining: number): number => Math.max(1000, Math.round(remaining * 1000));

/** "2 h 10 min" style countdown for the end of the current block. */
export function untilText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
