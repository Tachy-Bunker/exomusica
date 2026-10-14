/** Who can walk through which door. Three tiers: open to everyone, members (logged in), staff (admin). Pure data and functions, so the same table drives link tags, wipe colour and tests. */
export type Level = "open" | "members" | "staff";
export type Viewer = "guest" | "member" | "staff";

/** Prefixes that need more than "open". Anything not listed is open. Keep in step with the routes. */
export const DOORS: ReadonlyArray<{ prefix: string; level: Exclude<Level, "open"> }> = [
  { prefix: "/jam", level: "members" },
  { prefix: "/pms", level: "members" },
  { prefix: "/account", level: "members" },
  { prefix: "/my-music", level: "members" },
  { prefix: "/submit", level: "members" },
  { prefix: "/rewards", level: "members" },
  { prefix: "/signal", level: "members" },
  { prefix: "/hypotheses/draw", level: "members" },
  { prefix: "/admin", level: "staff" },
];

const hits = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?") || path.startsWith(prefix + "#");

/** The tier a path needs. Longest matching prefix wins. */
export function levelOf(path: string): Level {
  let best: { prefix: string; level: Level } | null = null;
  for (const d of DOORS) if (hits(path, d.prefix) && (!best || d.prefix.length > best.prefix.length)) best = d;
  return best?.level ?? "open";
}

const RANK: Record<Level, number> = { open: 0, members: 1, staff: 2 };
const VIEWER_RANK: Record<Viewer, number> = { guest: 0, member: 1, staff: 2 };

export const canEnter = (level: Level, viewer: Viewer) => VIEWER_RANK[viewer] >= RANK[level];

export function viewerOf(user: { isAdmin?: boolean } | null | undefined): Viewer {
  return !user ? "guest" : user.isAdmin ? "staff" : "member";
}

/** One stylesheet that tags every link this viewer cannot use yet. Attribute selectors, so no per-link JS and links added later are tagged for free. Empty string when nothing is locked (staff). */
export function lockCss(viewer: Viewer): string {
  const rules: string[] = [];
  for (const level of ["members", "staff"] as const) {
    if (canEnter(level, viewer)) continue;
    const sel = DOORS.filter((d) => d.level === level).flatMap((d) => {
      const p = d.prefix;
      return [`a[href="${p}"]`, `a[href^="${p}/"]`, `a[href^="${p}?"]`];
    }).map((s) => `${s}:not([data-nolock])::after`).join(",");
    rules.push(`${sel}{content:""/"${level === "members" ? "members only" : "staff only"}";display:inline-block;width:.6em;height:.75em;margin-left:.35em;vertical-align:-.05em;background:var(--door-${level});-webkit-mask:var(--lock-mask) center/contain no-repeat;mask:var(--lock-mask) center/contain no-repeat}`);
  }
  return rules.join("\n");
}
