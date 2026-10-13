export const PROBE_KINDS = ["lore", "track", "person", "point"] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];
export const PROBE_KEY = /^[a-z]{2,12}:[\w .@~/#:+-]{1,100}$/i;
export const MAX_SCANS = 5000;

export const DEFAULT_PROBE_COLORS = { lore: "#ff9d3c", track: "#ff4d4d", person: "#4da3ff", mod: "#ff3df0" } as const;
export type ProbeColors = Record<keyof typeof DEFAULT_PROBE_COLORS, string>;
const hex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

/** null = fine. An object with exactly the four known colours, each #rrggbb; null clears. */
export function probeColorsProblem(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) return "probeColors must be an object of four colours";
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_PROBE_COLORS)) if (!hex(o[k])) return `probeColors.${k} must be a colour like #ff9d3c`;
  if (Object.keys(o).length !== 4) return "probeColors has only lore, track, person and mod";
  return null;
}

export function scanProblem(b: { kind?: unknown; key?: unknown }): string | null {
  if (typeof b.kind !== "string" || !(PROBE_KINDS as readonly string[]).includes(b.kind)) return "unknown kind";
  if (typeof b.key !== "string" || !PROBE_KEY.test(b.key)) return "bad key";
  return null;
}
