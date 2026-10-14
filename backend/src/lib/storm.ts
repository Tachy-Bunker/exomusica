// Signal storm (milestone m-storm): when the community reaches the milestone a 48-hour storm begins. Every new scan feeds a shared meter; if the meter is full when the storm ends, the Artifact forms from what was scanned most. No state of its own: the window is computed from the moment the milestone was reached.
export const STORM_HOURS = 48;
export const STORM_GOAL = 1000;
export const STORM_ARMS = 9;
const H = 3_600_000;

export type StormState = "active" | "ended";
export interface StormWindow { startsAt: number; endsAt: number; state: StormState }
export function stormWindow(reachedAt: number, now: number): StormWindow {
  const endsAt = reachedAt + STORM_HOURS * H;
  return { startsAt: reachedAt, endsAt, state: now < endsAt ? "active" : "ended" };
}

export interface ScanCount { kind: string; key: string; n: number }
export interface Arm { kind: "track" | "lore" | "person"; label: string | null; n: number }
/** The Artifact's arms: the most scanned things in the window, biggest first. People are never named; only pages anyone can open are. */
export function armsOf(rows: ScanCount[], max = STORM_ARMS): Arm[] {
  return rows
    .filter((r) => r.kind === "track" || r.kind === "lore" || r.kind === "person")
    .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))
    .slice(0, max)
    .map((r) => ({ kind: r.kind as Arm["kind"], label: r.kind === "person" ? null : r.key, n: r.n }));
}

/** A number that stays the same for the same storm, for the picture and the notes. */
export function stormSeed(reachedAt: number): number { return (Math.imul(reachedAt % 2147483647, 2654435761) >>> 0) % 1_000_000; }
