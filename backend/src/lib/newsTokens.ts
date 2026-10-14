// Live numbers inside News (title, text, previews): write {{TRACKS}} and readers see the current count.
// Pure: the route passes in the stats. Unknown tokens are left exactly as typed so a typo is visible, not silently blank.

export type SiteStats = {
  totals: Record<string, number>;
  /** Per-branch counts, keyed by branch slug: {{BRANCHTRACKCOUNT:slug}}, {{ALBUMS:slug}} */
  byBranch: Record<string, { BRANCHTRACKCOUNT: number; ALBUMS: number }>;
  /** Filled by getTokenStats(): the current target and count of each milestone, by key. */
  milestones?: Record<string, { target: number; now: number }>;
};

export const TOKEN_HELP: Record<string, string> = {
  TRACKS: "all tracks, official and community",
  BRANCHTRACKCOUNT: "tracks on branches (official); add :branch-slug for one branch",
  COMMUNITYTRACKS: "tracks in community albums",
  ALBUMS: "branch albums; add :branch-slug for one branch",
  COMMUNITYALBUMS: "community albums",
  BRANCHES: "visible branches",
  MEMBERS: "members (no ghosts)",
  POSTS: "forum and chat messages",
  SCANS: "Probe scans by everyone",
  STUDIES: "studies",
  WIKIPAGES: "Log wiki pages",
  PLAYLISTS: "playlists",
  MINUTES: "minutes of official music",
  "MTARGET:key": "a milestone's current target (the admin can change it)",
  "MNOW:key": "a milestone's current count",
  "MTOGO:key": "how many more until that milestone",
  "TOGO:X:N": "how many more until X reaches N",
  "PCT:X:N": "X as a percentage of N (capped at 100)",
};

const TOKEN = /\{\{\s*([A-Za-z]+(?::[A-Za-z0-9_-]+){0,2})\s*\}\}/g;

function valueOf(parts: string[], stats: SiteStats): number | null {
  const [head, a, b] = parts.map((p, i) => (i === 0 ? p.toUpperCase() : p));
  const metric = (name: string, slug?: string): number | null => {
    const n = name.toUpperCase();
    if (slug) {
      const br = stats.byBranch[slug];
      return br && (n === "BRANCHTRACKCOUNT" || n === "ALBUMS") ? br[n] : null;
    }
    return typeof stats.totals[n] === "number" ? stats.totals[n]! : null;
  };
  if (head === "MTARGET" || head === "MNOW" || head === "MTOGO") {
    const m = a ? stats.milestones?.[a] : undefined;
    if (!m) return null;
    return head === "MTARGET" ? m.target : head === "MNOW" ? m.now : Math.max(0, m.target - m.now);
  }
  if (head === "TOGO" || head === "PCT") {
    const cur = a ? metric(a) : null;
    const target = Number(b);
    if (cur == null || !Number.isFinite(target) || target <= 0) return null;
    return head === "TOGO" ? Math.max(0, target - cur) : Math.min(100, Math.floor((cur / target) * 100));
  }
  return metric(head!, a);
}

export function fillTokens(text: string, stats: SiteStats): string {
  if (!text.includes("{{")) return text;
  return text.replace(TOKEN, (whole, inner: string) => {
    const v = valueOf(inner.split(":"), stats);
    return v == null ? whole : String(v);
  });
}

export const hasTokens = (text: string | null | undefined): boolean => !!text && text.includes("{{");
