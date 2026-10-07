import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { CONVERSATION_STATS_SQL, CONVERSATION_TRACE_SQL, MEMBER_LIST_SQL, RECENT_MESSAGES_SQL } from "../lib/conversationSql.js";
import { buildTraces, shapeConversation, shapeRecent, sumTraces, type Conversation, type RecentRow, type StatsRow, type TraceRow } from "../lib/conversations.js";
import { shapeMember, type Member, type MemberRow } from "../lib/members.js";
import { PUBLIC_CHANNEL_FILTER, isPublicChannel } from "../lib/publicChannels.js";
import { ttlCache } from "../lib/ttlCache.js";

const buildConversations = ttlCache(30_000, async () => {
  const channels = await prisma.forumChannel.findMany({
    where: PUBLIC_CHANNEL_FILTER, // unlisted (hidden-branch) chats stay out of the list; they still open by their address
    select: {
      id: true, slug: true, name: true, description: true, category: true, position: true, branchId: true, isUserQuestion: true,
      branch: { select: { slug: true, name: true, visibility: true } },
      studies: { select: { slug: true, title: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  const listed = channels.filter((c) => isPublicChannel(c)); // never rely on the query filter alone
  const ids = listed.map((c) => c.id);
  // All three queries only ever see the listed (public) chats, so nothing about an unlisted chat is computed or shown.
  const [stats, traceRows, recentRows] = ids.length
    ? await Promise.all([
        prisma.$queryRawUnsafe<StatsRow[]>(CONVERSATION_STATS_SQL, ids),
        prisma.$queryRawUnsafe<TraceRow[]>(CONVERSATION_TRACE_SQL, ids),
        prisma.$queryRawUnsafe<RecentRow[]>(RECENT_MESSAGES_SQL, ids),
      ])
    : [[], [], []];
  const byId = new Map(stats.map((s) => [s.id, s]));
  const traces = buildTraces(traceRows);
  const now = Date.now();
  const conversations: Conversation[] = listed
    .map((c) => shapeConversation({ ...c, branch: c.branch ? { slug: c.branch.slug, name: c.branch.name } : null }, byId.get(c.id), now, traces.get(c.id)))
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.name.localeCompare(b.name));
  const lastSignal = conversations.reduce<number | null>((m, c) => (c.lastAt !== null && (m === null || c.lastAt > m) ? c.lastAt : m), null);
  return {
    generatedAt: now,
    totals: {
      conversations: conversations.length,
      week: conversations.reduce((n, c) => n + c.week, 0),
      day: conversations.reduce((n, c) => n + c.day, 0),
      activeChats: conversations.filter((c) => c.week > 0).length,
      lastSignalAt: lastSignal,
    },
    trace: sumTraces(conversations.map((c) => c.trace)),
    conversations,
    recent: shapeRecent(recentRows),
  };
});

const buildMembers = ttlCache(60_000, async () => {
  const rows = await prisma.$queryRawUnsafe<MemberRow[]>(MEMBER_LIST_SQL);
  const members: Member[] = rows.map(shapeMember);
  return { generatedAt: Date.now(), count: members.length, members };
});

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  // Every chat the public may see, with how alive it is. One cached request for the whole hub.
  app.get("/api/conversations", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=15");
    return buildConversations();
  });
  // Real accounts only: ghosts and deleted accounts are never listed. The fields are the ones a public profile already shows.
  app.get("/api/members", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return buildMembers();
  });
}
