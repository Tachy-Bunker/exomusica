// The milestone state a draft room test runs under (P8). Pure: a copy of the list with every flag set, cleared, or left as it is.
import type { Milestone } from "./milestones";

export type MsMode = "asis" | "all" | "none";
export const MS_MODES: readonly MsMode[] = ["asis", "all", "none"];
export const MS_LABEL: Record<MsMode, string> = { asis: "milestones as they are", all: "all milestones reached", none: "no milestone reached" };

/** The list a room sees under a mode. The input is never changed. */
export function applyMsMode(list: readonly Milestone[], mode: MsMode): Milestone[] {
  if (mode === "asis") return [...list];
  const reached = mode === "all";
  return list.map((m) => ({ ...m, reached }));
}

/** The keys a wire runtime counts as reached under a mode. */
export function reachedKeys(list: readonly Milestone[], mode: MsMode): Set<string> {
  return new Set(applyMsMode(list, mode).filter((m) => m.reached).map((m) => m.key));
}
