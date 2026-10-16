// Community milestones: unlocked for EVERYONE when the whole community crosses a number.
// The catalogue and its default numbers live here; an admin can change a target or switch one off (MilestoneSetting).
// Pure resolving (resolveMilestones) is kept apart from the database so it is tested without one.

export type Metric = "TRACKS" | "POSTS" | "SCANS" | "MEMBERS" | "STUDIES" | "WIKIPAGES" | "PLAYLISTS" | "BRANCHES" | "COMMUNITYTRACKS" | "COMMUNITYALBUMS" | "MINUTES" | "DAYS" | "REACHED";

export interface MilestoneDef {
  key: string;
  title: string;
  perk: string;
  metric: Metric;
  target: number;
  /** false = the reward is announced but not built yet: it still counts and shows, labelled honestly. */
  live: boolean;
  playlists?: number;
  frame?: string;
}

export const METRIC_LABEL: Record<Metric, string> = {
  TRACKS: "tracks", POSTS: "posts", SCANS: "scans", MEMBERS: "members", STUDIES: "studies", WIKIPAGES: "wiki pages", PLAYLISTS: "playlists",
  BRANCHES: "branches", COMMUNITYTRACKS: "community tracks", COMMUNITYALBUMS: "community albums", MINUTES: "minutes of official music", DAYS: "days of age", REACHED: "milestones reached",
};

// Five arcs: Ignition, Instruments, Voice, Map, Expedition. Order here is the order of the story.
export const MILESTONES: MilestoneDef[] = [
  { key: "m-roll", title: "Roll call", metric: "MEMBERS", target: 25, live: true, perk: "The Members constellation lights up in colour: each star takes its member's own colour." },
  { key: "m-tracks", title: "First hundred", metric: "TRACKS", target: 100, live: true, playlists: 5, perk: "Room for 5 more playlists, for everyone." },
  { key: "m-sharedlens", title: "Shared lens", metric: "SCANS", target: 500, live: true, perk: "The Probe card tells you how many other members have scanned the same thing." },
  { key: "m-posts", title: "Chorus", metric: "POSTS", target: 5000, live: true, frame: "frame-chorus", perk: "A shared Chorus frame for everyone's profile picture." },
  { key: "m-founders", title: "Founders' door", metric: "MEMBERS", target: 50, live: true, perk: "The Ancients section gets a vault: the earliest recovered logs as a playable timeline." },
  { key: "m-thermal", title: "Thermal lens", metric: "SCANS", target: 1000, live: true, perk: "The Thermal lens gets a second reading, \"Scanned\": warm where the community scans most, not only where activity is recent." },
  { key: "m-xray", title: "X-ray lens", metric: "STUDIES", target: 25, live: true, perk: "The X-ray lens reaches further: it also shows the pages two links away." },
  { key: "m-spectral", title: "Spectral wall", metric: "TRACKS", target: 300, live: true, perk: "A Soundbay view where every official track is a spectrogram tile. It fills in gradually as the server draws them." },
  { key: "m-echo", title: "Echo", metric: "POSTS", target: 10000, live: true, perk: "Each day one old message (at least 30 days back, from a public chat) resurfaces on the homepage." },
  { key: "m-index", title: "Index", metric: "WIKIPAGES", target: 200, live: true, perk: "A Random fragment button in the Log: a passage from a random wiki page." },
  { key: "m-emoji", title: "Emoji gate", metric: "POSTS", target: 2500, live: false, perk: "Members can upload their own emoji, one slot each." },
  { key: "m-scans", title: "Wide lens", metric: "SCANS", target: 2000, live: true, playlists: 5, perk: "Room for 5 more playlists, for everyone." },
  { key: "m-jam", title: "Jam grows", metric: "COMMUNITYALBUMS", target: 50, live: true, perk: "Jam rooms hold 8 players, and a session can be printed as a draft community album." },
  { key: "m-commons", title: "Commons pack", metric: "COMMUNITYTRACKS", target: 500, live: true, perk: "A sample ZIP of tracks whose creators allow reuse, rebuilt monthly." },
  { key: "m-jingle", title: "Collective jingle", metric: "TRACKS", target: 150, live: true, perk: "The default site jingle is replaced by one made from community stems." },
  { key: "m-ring", title: "Second ring", metric: "BRANCHES", target: 20, live: true, perk: "The scan map gains an outer ring where hidden branches show as sealed rooms." },
  { key: "m-visor", title: "Echo visor", metric: "SCANS", target: 1500, live: true, perk: "In the 3D rooms the visor can ping: a ring sweeps the room, sealed doors answer with their own note, and anything left to scan lights up." },
  { key: "m-crateradio", title: "Crate radio", metric: "PLAYLISTS", target: 100, live: true, perk: "An always-on station shuffling public playlists, credited by playlist." },
  { key: "m-longwave", title: "Long wave", metric: "MINUTES", target: 600, live: true, perk: "A radio station looping the whole catalogue, with a shared position everyone hears together." },
  { key: "m-chart", title: "Chart layer", metric: "MEMBERS", target: 150, live: true, perk: "The Chart shows where members' recent activity sits, as anonymous pulses." },
  { key: "m-season", title: "Season shift", metric: "DAYS", target: 180, live: true, perk: "The accent colours turn with each 90-day era of the site, and an optional ambient hum changes its note." },
  { key: "m-monthly", title: "Monthly challenge", metric: "MEMBERS", target: 100, live: true, perk: "A monthly challenge with a boss brief opens." },
  { key: "m-storm", title: "Signal storm", metric: "SCANS", target: 5000, live: true, perk: "A 48-hour event where scanning feeds a shared meter; fill it and the Artifact forms from what everyone scanned most." },
  { key: "m-offline", title: "Offline cache", metric: "TRACKS", target: 1000, live: true, perk: "Playlists can be saved for offline listening too, not only albums." },
  { key: "m-artifacts", title: "Twelve Artifacts", metric: "SCANS", target: 10000, live: true, perk: "The twelve Artifacts are revealed, one per twelfth of the way." },
  { key: "m-hull", title: "Hull", metric: "REACHED", target: 24, live: true, perk: "The seed of the explorable ship: a corridor with one lit door per milestone reached." },
];

export interface MilestoneSettingRow { key: string; target: number | null; enabled: boolean; reachedAt: Date | null }
export interface MilestoneState extends MilestoneDef {
  defaultTarget: number;
  enabled: boolean;
  now: number;
  reached: boolean;
  reachedAt: Date | null;
}

export const MAX_TARGET = 10_000_000;
export const cleanTarget = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_TARGET ? v : undefined;

/** Combine the catalogue, the admin's settings and the current totals. REACHED counts the other enabled milestones already reached. */
export function resolveMilestones(defs: readonly MilestoneDef[], settings: readonly MilestoneSettingRow[], totals: Record<string, number>, now = new Date()): MilestoneState[] {
  const by = new Map(settings.map((s) => [s.key, s]));
  const make = (d: MilestoneDef, value: number): MilestoneState => {
    const s = by.get(d.key);
    const target = s?.target ?? d.target;
    const enabled = s?.enabled ?? true;
    const reached = enabled && value >= target;
    return { ...d, target, defaultTarget: d.target, enabled, now: value, reached, reachedAt: reached ? (s?.reachedAt ?? now) : null };
  };
  const plain = defs.filter((d) => d.metric !== "REACHED").map((d) => make(d, totals[d.metric] ?? 0));
  const others = plain.filter((m) => m.reached).length;
  const out = defs.map((d) => (d.metric === "REACHED" ? make(d, others) : plain.find((m) => m.key === d.key)!));
  return out;
}

