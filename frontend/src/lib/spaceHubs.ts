// Searching, filtering and sorting for the Conversations hub and the Members directory. Pure, so it is tested without a browser.

export type ConversationKind = "branch" | "study" | "question" | "topic";
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
  day: number;
  week: number;
  voices: number;
  level: 0 | 1 | 2 | 3 | 4;
  trace: number[];
  lastAt: number | null;
  lastBy: string | null;
  lastText: string;
}
export interface RecentMessage { id: number; channelSlug: string; channelName: string; branchSlug: string | null; href: string; author: string; text: string; at: number }
export interface ConversationsData {
  generatedAt: number;
  totals: { conversations: number; week: number; day: number; activeChats: number; lastSignalAt: number | null };
  trace: number[]; // all chats together, per day for 14 days, oldest first, today last
  conversations: Conversation[];
  recent: RecentMessage[];
}
export interface Member { username: string; avatarUrl: string | null; bio: string; joinedAt: number; studies: number; messages: number }
export interface MembersData { generatedAt: number; count: number; members: Member[] }

/** Lower-case and accent-free, so "cafe" finds "Café" and "ORBIT" finds "orbit". */
export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (q: string) => fold(q).split(/\s+/).filter(Boolean);
/** Every word typed must appear somewhere in the text, in any order. */
const matches = (haystack: string, q: string) => { const h = fold(haystack); return words(q).every((w) => h.includes(w)); };

// ---------------------------------------------------------------- conversations
export type ConversationFilter = "all" | ConversationKind;
export type ConversationSort = "recent" | "busy" | "az";

export function filterConversations(list: Conversation[], kind: ConversationFilter, query: string): Conversation[] {
  return list.filter((c) => {
    if (kind !== "all" && c.kind !== kind) return false;
    if (!query.trim()) return true;
    return matches([c.name, c.category ?? "", c.blurb, c.branch?.name ?? "", ...c.studies.map((s) => s.title)].join(" \n "), query);
  });
}

export function sortConversations(list: Conversation[], sort: ConversationSort): Conversation[] {
  const byName = (a: Conversation, b: Conversation) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const copy = [...list];
  if (sort === "az") return copy.sort(byName);
  if (sort === "busy") return copy.sort((a, b) => b.week - a.week || b.total - a.total || byName(a, b));
  return copy.sort((a, b) => (b.lastAt ?? -1) - (a.lastAt ?? -1) || byName(a, b)); // recent: chats nobody has written in come last
}

export function countByKind(list: Conversation[]): Record<ConversationFilter, number> {
  const out: Record<ConversationFilter, number> = { all: list.length, branch: 0, topic: 0, study: 0, question: 0 };
  for (const c of list) out[c.kind]++;
  return out;
}

export const KIND_LABEL: Record<ConversationKind, string> = { branch: "Branch", topic: "Topic", study: "Study", question: "Question" };
export const SIGNAL_LABEL = ["Dormant", "Quiet", "Active", "Lively", "Busy"] as const;

// ---------------------------------------------------------------- members
export type MemberFilter = "all" | "new" | "active" | "chat";
export type MemberSort = "newest" | "active" | "az";
const DAY = 86_400_000;

export function filterMembers(list: Member[], filter: MemberFilter, query: string, inChat: Set<string>, now = Date.now()): Member[] {
  return list.filter((m) => {
    if (filter === "new" && now - m.joinedAt > 30 * DAY) return false;
    if (filter === "active" && m.messages === 0) return false;
    if (filter === "chat" && !inChat.has(m.username)) return false;
    return !query.trim() || matches(`${m.username} \n ${m.bio}`, query);
  });
}

export function sortMembers(list: Member[], sort: MemberSort): Member[] {
  const byName = (a: Member, b: Member) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  const copy = [...list];
  if (sort === "az") return copy.sort(byName);
  if (sort === "active") return copy.sort((a, b) => b.messages - a.messages || b.joinedAt - a.joinedAt || byName(a, b));
  return copy.sort((a, b) => b.joinedAt - a.joinedAt || byName(a, b));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthYear = (ms: number) => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** A stable colour from a name, for members without a picture: the same person always gets the same one. */
export function nameHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
/** The first letter (or character) to show on a picture-less avatar. */
export const initialOf = (name: string) => (Array.from(name.trim())[0] ?? "?").toUpperCase();

/** Fills in anything an older server reply lacks, so a page never breaks on a missing field (for instance while a deploy is half done). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeConversations(d: Record<string, any>): ConversationsData {
  const zeros = () => new Array(14).fill(0);
  const goodTrace = (t: unknown): number[] => (Array.isArray(t) && t.length === 14 ? (t as number[]) : zeros());
  return {
    generatedAt: d.generatedAt ?? Date.now(),
    totals: { conversations: 0, week: 0, day: 0, activeChats: 0, lastSignalAt: null, ...(d.totals ?? {}) },
    trace: goodTrace(d.trace),
    recent: Array.isArray(d.recent) ? d.recent : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations: ((d.conversations ?? []) as Record<string, any>[]).map((c) => ({ studies: [], branch: null, category: null, blurb: "", day: 0, week: 0, voices: 0, total: 0, level: 0, lastAt: null, lastBy: null, lastText: "", ...c, trace: goodTrace(c.trace) })) as unknown as Conversation[],
  };
}


// ---------------------------------------------------------------- the grouped list

export interface ListGroup { key: string; title: string; items: Conversation[] }

/**
 * The List view: topics under their categories (in the admin's category order), then the branches, the growing seeds, the studies and the questions.
 * No sorting: inside each group the conversations keep the order they come in.
 */
export function groupForList(list: Conversation[], categoryOrder: string[], seedChats: Set<string>): ListGroup[] {
  const topics = new Map<string, Conversation[]>();
  for (const c of list) if (c.kind === "topic") (topics.get(c.category ?? "") ?? topics.set(c.category ?? "", []).get(c.category ?? "")!).push(c);
  const rank = (cat: string) => { const i = categoryOrder.indexOf(cat); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
  const cats = [...topics.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : rank(a) - rank(b))); // stable: categories nobody ordered keep their first-seen order, no category goes last
  const groups: ListGroup[] = cats.map((c) => ({ key: `topic:${c}`, title: c || "Topics", items: topics.get(c)! }));
  const branches = list.filter((c) => c.kind === "branch");
  groups.push({ key: "branches", title: "Branches", items: branches.filter((c) => !seedChats.has(c.slug)) });
  groups.push({ key: "seeds", title: "Growing seeds", items: branches.filter((c) => seedChats.has(c.slug)) });
  groups.push({ key: "studies", title: "Studies", items: list.filter((c) => c.kind === "study") });
  groups.push({ key: "questions", title: "Questions", items: list.filter((c) => c.kind === "question") });
  return groups.filter((g) => g.items.length > 0);
}
