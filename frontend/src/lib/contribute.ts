// The contribution page's logic. Pure, so it is tested without a browser.
import { fold } from "./spaceHubs";

export type SubmissionStateKey = "started" | "waiting" | "approved" | "not-accepted";
export interface MySubmission { slug: string; title: string; trackCount: number; state: SubmissionStateKey }
export type ContributeSample =
  | { kind: "track"; source: "official" | "community"; trackId: number; albumSlug: string; title: string; detail: string }
  | { kind: "attachment"; url: string; title: string; origin: { label: string; href: string } | null };
export interface ContributeBranch {
  slug: string;
  name: string;
  description: string | null;
  coverArtUrl: string | null;
  hasBrief: boolean;
  backgroundUrl: string | null;
  backgroundOpacity: number;
  previewUrl: string | null;
  image?: string | null; // the branch's main image: the background of its row
  secondaryImage?: string | null; // its secondary image: the background of its opened panel
  sample?: ContributeSample | null;
  sketchCount: number;
  mySubmissions: MySubmission[];
}

/** Plain words for where a submission stands. "Waiting for review" is accurate: a person decides; nothing is published on its own. */
export const STATE_LABEL: Record<SubmissionStateKey, string> = {
  started: "Started: add your tracks",
  waiting: "Waiting for review",
  approved: "Approved by the team",
  "not-accepted": "Not accepted this time",
};

export interface NextStep {
  stage: "login" | "prepare" | "continue" | "waiting" | "approved" | "again";
  headline: string;
  detail: string;
  submission?: MySubmission;
}

const ORDER: SubmissionStateKey[] = ["started", "waiting", "approved", "not-accepted"];

/** What the person should do next, for this branch, given what they have already done. */
export function nextStep(loggedIn: boolean, b: ContributeBranch): NextStep {
  if (!loggedIn) {
    return { stage: "login", headline: "Read and listen first. Log in when you're ready to send something.", detail: "The brief, the sample and the sketches are open to everyone. You need an account to submit." };
  }
  const first = ORDER.map((st) => b.mySubmissions.find((s) => s.state === st)).find(Boolean);
  if (!first) {
    return { stage: "prepare", headline: "Get ready, then submit.", detail: "Read the brief, hear the sample, and use the sketches if there are any. Nothing is sent until you press Submit work and add your tracks." };
  }
  switch (first.state) {
    case "started":
      return { stage: "continue", submission: first, headline: `Finish "${first.title}"`, detail: "You've started this submission but haven't added a track yet. The team can only listen once it has at least one." };
    case "waiting":
      return { stage: "waiting", submission: first, headline: `"${first.title}" is waiting for review`, detail: "The team will listen and reply in its discussion. Nothing is added to the branch unless they approve it. There's nothing more you need to do." };
    case "approved":
      return { stage: "approved", submission: first, headline: `"${first.title}" was approved`, detail: "The team approved it. You're welcome to send another piece." };
    default:
      return { stage: "again", submission: first, headline: `"${first.title}" wasn't accepted this time`, detail: "The team's reply is in its discussion. You're welcome to send a new piece." };
  }
}

export type BranchFilter = "all" | "sample" | "sketches" | "brief" | "mine";
export type BranchSort = "az" | "material";

export function filterBranches(list: ContributeBranch[], filter: BranchFilter, query: string): ContributeBranch[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return list.filter((b) => {
    if (filter === "sample" && !b.previewUrl) return false;
    if (filter === "sketches" && b.sketchCount === 0) return false;
    if (filter === "brief" && !b.hasBrief) return false;
    if (filter === "mine" && b.mySubmissions.length === 0) return false;
    const hay = fold(`${b.name} ${b.description ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/** "material": the branches with the most to start from (sketches, then a sample, then a brief) come first. */
export function sortBranches(list: ContributeBranch[], sort: BranchSort): ContributeBranch[] {
  const byName = (a: ContributeBranch, b: ContributeBranch) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const score = (b: ContributeBranch) => b.sketchCount * 100 + (b.previewUrl ? 10 : 0) + (b.hasBrief ? 1 : 0);
  return [...list].sort(sort === "material" ? (a, b) => score(b) - score(a) || byName(a, b) : byName);
}
