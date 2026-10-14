// What an admin should look at, per panel. Three kinds of red light:
//   todo    - something is waiting on a decision (join requests, submissions, reward claims)
//   new     - something appeared since the admin last opened that panel
//   missing - a thing that is live but incomplete (a branch with no cover, a track with no genres)
// Pure rules over plain rows, so they can be tested without a database; the route only gathers the rows.

export interface AttentionItem { label: string; to: string; note?: string }
export interface PanelAttention { kind: "todo" | "new" | "missing"; count: number; items: AttentionItem[] }
export type Attention = Record<string, PanelAttention>;

const blank = (s: string | null | undefined) => !s || !s.trim();
const MAX_ITEMS = 40;

export function missingForBranch(b: { description: string | null; coverArtUrl: string | null }): string[] {
  const m: string[] = [];
  if (blank(b.description)) m.push("no description");
  if (blank(b.coverArtUrl)) m.push("no cover image");
  return m;
}
export function missingForAlbum(a: { coverArtUrl: string | null; description: string | null; composer: string; trackCount: number }): string[] {
  const m: string[] = [];
  if (a.trackCount === 0) m.push("no tracks");
  if (blank(a.coverArtUrl)) m.push("no cover");
  if (blank(a.description)) m.push("no description");
  if (blank(a.composer)) m.push("no composer");
  return m;
}
export function missingForTrack(t: { genres: string[]; durationSeconds: number | null }): string[] {
  const m: string[] = [];
  if (t.genres.length === 0) m.push("no genres");
  if (!t.durationSeconds) m.push("no duration");
  return m;
}
export function missingForCollaborator(c: { bio: string | null; pictureUrl: string | null }): string[] {
  const m: string[] = [];
  if (blank(c.bio)) m.push("no bio");
  if (blank(c.pictureUrl)) m.push("no picture");
  return m;
}

function panel(kind: PanelAttention["kind"], count: number, items: AttentionItem[]): PanelAttention | null {
  return count > 0 ? { kind, count, items: items.slice(0, MAX_ITEMS) } : null;
}

export interface AttentionInput {
  joinRequests: { id: number; username: string }[]; joinTotal: number;
  submissions: { id: number; title: string }[]; submissionTotal: number;
  rewardClaims: { id: number; title: string }[]; rewardTotal: number;
  newStudies: { slug: string; title: string; owner: string }[];
  newQuestions: { slug: string; name: string }[];
  newTrashed: number;
  branches: { name: string; description: string | null; coverArtUrl: string | null }[];
  albums: { slug: string; title: string; coverArtUrl: string | null; description: string | null; composer: string; trackCount: number }[];
  tracks: { id: number; title: string; albumTitle: string; genres: string[]; durationSeconds: number | null }[];
  collaborators: { name: string; bio: string | null; pictureUrl: string | null }[];
  aboutFeatureCount: number;
  faviconUrl: string | null;
}

export function buildAttention(i: AttentionInput): { panels: Attention; total: number } {
  const out: Attention = {};
  const set = (path: string, p: PanelAttention | null) => { if (p) out[path] = p; };

  set("join-requests", panel("todo", i.joinTotal, i.joinRequests.map((j) => ({ label: j.username, to: "/admin/join-requests", note: "waiting for an answer" }))));
  set("submissions", panel("todo", i.submissionTotal, i.submissions.map((s) => ({ label: s.title, to: "/admin/submissions", note: "waiting for review" }))));
  set("rewards", panel("todo", i.rewardTotal, i.rewardClaims.map((r) => ({ label: r.title, to: "/admin/rewards", note: "claim to fulfil" }))));

  set("studies", panel("new", i.newStudies.length, i.newStudies.map((s) => ({ label: s.title, to: `/study/${s.slug}`, note: `by ${s.owner}, since you last looked` }))));
  set("channels", panel("new", i.newQuestions.length, i.newQuestions.map((q) => ({ label: q.name, to: "/admin/channels", note: "new member question" }))));
  set("trash", panel("new", i.newTrashed, [{ label: `${i.newTrashed} message${i.newTrashed === 1 ? "" : "s"} deleted`, to: "/admin/trash", note: "since you last looked" }]));

  const mb = i.branches.map((b) => ({ b, m: missingForBranch(b) })).filter((x) => x.m.length);
  set("branches", panel("missing", mb.length, mb.map((x) => ({ label: x.b.name, to: "/admin/branches", note: x.m.join(", ") }))));
  const ma = i.albums.map((a) => ({ a, m: missingForAlbum(a) })).filter((x) => x.m.length);
  set("albums", panel("missing", ma.length, ma.map((x) => ({ label: x.a.title, to: "/admin/albums", note: x.m.join(", ") }))));
  const mt = i.tracks.map((t) => ({ t, m: missingForTrack(t) })).filter((x) => x.m.length);
  set("all-tracks", panel("missing", mt.length, mt.map((x) => ({ label: `${x.t.title} (${x.t.albumTitle})`, to: "/admin/all-tracks", note: x.m.join(", ") }))));
  const mc = i.collaborators.map((c) => ({ c, m: missingForCollaborator(c) })).filter((x) => x.m.length);
  set("collaborators", panel("missing", mc.length, mc.map((x) => ({ label: x.c.name, to: "/admin/collaborators", note: x.m.join(", ") }))));
  set("about", panel("missing", i.aboutFeatureCount === 0 ? 1 : 0, [{ label: "The About page has nothing on it", to: "/admin/about" }]));
  set("embeds", panel("missing", blank(i.faviconUrl) ? 1 : 0, [{ label: "No site favicon", to: "/admin/embeds" }]));

  const total = Object.values(out).reduce((n, p) => n + p.count, 0);
  return { panels: out, total };
}
