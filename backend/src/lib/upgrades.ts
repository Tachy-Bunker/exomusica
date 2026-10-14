// Suit upgrades: earned by doing something curious once, cosmetic or convenience only, never a gate on a core feature.
// The catalogue lives here (versioned with the code); who has what lives in UserUpgrade.
import type { LogSection } from "./fieldLog.js";

export interface UpgradeDef {
  key: string;
  title: string;
  perk: string;
  /** Three wordings of the same pointer: precise, vague, a whisper. They fade as days pass since you were last "tuned in". */
  hints: [string, string, string];
}

export const UPGRADES: UpgradeDef[] = [
  { key: "tint", title: "Probe tint", perk: "Choose your own colour for your marks in the Scan visor.",
    hints: ["Turn on Probe mode (the I key) and scan anything: a title, a name, a track.", "Something wakes the first time you look closely at the site.", "A first look closes a first door."] },
  { key: "frame-spark", title: "Spark frame", perk: "A glowing frame around your profile picture.",
    hints: ["In XenoLab, open a phenomenon card and scan all of its parts: name, notes, example and preset.", "A creature in XenoLab gives something to anyone who learns all of it.", "Complete a small thing somewhere in the lab."],
  },
  { key: "frame-log", title: "Log frame", perk: "A banded frame around your profile picture.",
    hints: ["In the Field Log, fill one whole section to 100%.", "A full section of the Field Log holds something back for you.", "Finish a list, and listen."] },
  { key: "crate", title: "Deep crate", perk: "Room for 5 more playlists.",
    hints: ["Scan 25 different things in Probe mode: titles, names, tracks, anything.", "Keep looking closely at things; a lot of them.", "Many small looks add up to room."] },
];
export const UPGRADE_KEYS = UPGRADES.map((u) => u.key);

export const PLAYLIST_BASE = 10;
/** How many playlists this member may own: the base, plus their own Deep crate, plus every reached milestone. */
export function playlistCap(held: ReadonlySet<string>, reached: readonly { playlists?: number }[]): number {
  return PLAYLIST_BASE + (held.has("crate") ? 5 : 0) + reached.reduce((n, m) => n + (m.playlists ?? 0), 0);
}

/** Frames earned by one's own scans, plus those the whole community unlocks (see milestones.ts). */
export const FRAME_KEYS = [...UPGRADES.filter((u) => u.key.startsWith("frame-")).map((u) => u.key), "frame-chorus"];

/** 0 = precise, 1 = vague, 2 = whisper. Counted from the later of "first saw the hint" and "last re-tuned". */
export function hintLevel(firstSeen: Date, retuned: Date | null, now: Date): 0 | 1 | 2 {
  const from = retuned && retuned > firstSeen ? retuned : firstSeen;
  const days = (now.getTime() - from.getTime()) / 86_400_000;
  return days < 3 ? 0 : days < 10 ? 1 : 2;
}

const unlocked = (e: { key: string; stages?: { key: string }[] }, scanned: ReadonlySet<string>) =>
  scanned.has(e.key) || (e.stages ?? []).some((s) => scanned.has(s.key));

/** Which upgrades these scans earn. Pure: the route passes in the catalogue and the member's scan keys. */
export function earnedBy(sections: LogSection[], scanned: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (scanned.size > 0) out.push("tint");
  if (scanned.size >= 25) out.push("crate");
  const fullCard = sections.some((s) => s.entries.some((e) => (e.stages?.length ?? 0) >= 2 && e.stages!.every((g) => scanned.has(g.key))));
  if (fullCard) out.push("frame-spark");
  if (sections.some((s) => s.entries.length > 0 && s.entries.every((e) => unlocked(e, scanned)))) out.push("frame-log");
  return out;
}

export function cleanChoice(input: unknown, earned: ReadonlySet<string>): { frame: string | null; tint: string | null } | null {
  const o = (input ?? {}) as Record<string, unknown>;
  let frame: string | null = null, tint: string | null = null;
  if (o.frame !== null && o.frame !== undefined) {
    if (typeof o.frame !== "string" || !FRAME_KEYS.includes(o.frame) || !earned.has(o.frame)) return null;
    frame = o.frame;
  }
  if (o.tint !== null && o.tint !== undefined) {
    if (typeof o.tint !== "string" || !/^#[0-9a-fA-F]{6}$/.test(o.tint) || !earned.has("tint")) return null;
    tint = o.tint.toLowerCase();
  }
  return { frame, tint };
}
