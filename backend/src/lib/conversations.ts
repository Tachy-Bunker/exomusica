// Shaping for the Conversations hub: pure, so it is tested without a database.
import { attachmentOnlyLabel, plainExcerpt } from "./publicChannels.js";

export type ConversationKind = "branch" | "study" | "question" | "topic";

export interface ChannelRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  position: number;
  branchId: number | null;
  isUserQuestion: boolean;
  branch: { slug: string; name: string } | null;
  studies: { slug: string; title: string }[];
}
export interface StatsRow {
  id: number;
  total: number;
  week: number;
  voices: number;
  last_text: string | null;
  last_at: Date | null;
  last_by: string | null;
  last_files: string | null;
}
export interface Conversation {
  slug: string;
  name: string;
  kind: ConversationKind;
  href: string;
  category: string | null;
  blurb: string;
  branch: { slug: string; name: string } | null;
  studies: { slug: string; title: string }[];
  total: number;
  week: number;
  voices: number;
  level: 0 | 1 | 2 | 3 | 4; // signal strength: 0 dormant ... 4 busy
  lastAt: number | null;
  lastBy: string | null;
  lastText: string;
}

/** A branch's chat is a branch chat; a chat with studies attached is a study chat; a member's own thread is a question. */
export function kindOf(ch: Pick<ChannelRow, "branchId" | "isUserQuestion" | "studies">): ConversationKind {
  if (ch.branchId !== null) return "branch";
  if (ch.studies.length > 0) return "study";
  if (ch.isUserQuestion) return "question";
  return "topic";
}

export const hrefOf = (ch: Pick<ChannelRow, "slug" | "branch">) => (ch.branch ? `/branch/${ch.branch.slug}` : `/topic/${ch.slug}`);

const DAY = 86_400_000;
/** 0 = nothing for a month, 1 = quiet this week, 2 = a few messages this week, 3 = lively, 4 = busy. */
export function activityLevel(week: number, lastAt: number | null, now = Date.now()): 0 | 1 | 2 | 3 | 4 {
  if (lastAt === null || now - lastAt > 30 * DAY) return 0;
  if (week >= 20) return 4;
  if (week >= 5) return 3;
  if (week >= 1) return 2;
  return 1;
}

export function shapeConversation(ch: ChannelRow, st: StatsRow | undefined, now = Date.now()): Conversation {
  const lastAt = st?.last_at ? st.last_at.getTime() : null;
  const files = st?.last_files ? st.last_files.split("\n") : [];
  const text = plainExcerpt(st?.last_text ?? "", 90) || attachmentOnlyLabel(files);
  const by = st?.last_by ?? null;
  return {
    slug: ch.slug,
    name: ch.name,
    kind: kindOf(ch),
    href: hrefOf(ch),
    category: ch.category,
    blurb: plainExcerpt(ch.description ?? "", 120),
    branch: ch.branch,
    studies: ch.studies,
    total: st?.total ?? 0,
    week: st?.week ?? 0,
    voices: st?.voices ?? 0,
    level: activityLevel(st?.week ?? 0, lastAt, now),
    lastAt,
    lastBy: by,
    lastText: by && text ? (text.startsWith("sent ") || text.startsWith("shared ") ? `${by} ${text}` : `${by}: ${text}`) : "",
  };
}
