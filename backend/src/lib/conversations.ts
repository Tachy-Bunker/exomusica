// Shaping for the Conversations hub: pure, so it is tested without a database.
import { TRACE_DAYS } from "./conversationSql.js";
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
  day: number;
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
  day: number; // messages in the last 24 hours
  level: 0 | 1 | 2 | 3 | 4; // signal strength: 0 dormant ... 4 busy
  trace: number[]; // messages per day for the last 14 days, oldest first, today last
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

export function shapeConversation(ch: ChannelRow, st: StatsRow | undefined, now = Date.now(), trace: number[] = new Array(TRACE_DAYS).fill(0)): Conversation {
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
    day: st?.day ?? 0,
    trace,
    level: activityLevel(st?.week ?? 0, lastAt, now),
    lastAt,
    lastBy: by,
    lastText: by && text ? (text.startsWith("sent ") || text.startsWith("shared ") ? `${by} ${text}` : `${by}: ${text}`) : "",
  };
}

export interface TraceRow { id: number; ago: number; n: number }

/** Turns "chat 11 had 3 messages 2 days ago" rows into one 14-number trace per chat (oldest first, today last). Rows outside the window are ignored. */
export function buildTraces(rows: TraceRow[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const r of rows) {
    if (r.ago < 0 || r.ago >= TRACE_DAYS) continue;
    const t = out.get(r.id) ?? new Array(TRACE_DAYS).fill(0);
    t[TRACE_DAYS - 1 - r.ago] += r.n;
    out.set(r.id, t);
  }
  return out;
}

/** All chats added together, day by day. */
export function sumTraces(traces: number[][]): number[] {
  const total = new Array(TRACE_DAYS).fill(0);
  for (const t of traces) t.forEach((n, i) => { total[i] += n; });
  return total;
}

export interface RecentRow { id: number; channel_slug: string; channel_name: string; branch_slug: string | null; username: string; text: string | null; at: Date; files: string | null }
export interface RecentMessage { id: number; channelSlug: string; channelName: string; branchSlug: string | null; href: string; author: string; text: string; at: number }

/** The live feed: plain text per message; a message with nothing readable and no files is left out. */
export function shapeRecent(rows: RecentRow[]): RecentMessage[] {
  const out: RecentMessage[] = [];
  for (const r of rows) {
    const text = plainExcerpt(r.text ?? "", 110) || attachmentOnlyLabel(r.files ? r.files.split("\n") : []);
    if (!text) continue;
    out.push({ id: r.id, channelSlug: r.channel_slug, channelName: r.channel_name, branchSlug: r.branch_slug, href: r.branch_slug ? `/branch/${r.branch_slug}` : `/topic/${r.channel_slug}`, author: r.username, text, at: r.at.getTime() });
  }
  return out;
}
