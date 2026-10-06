import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { CONVERSATION_STATS_SQL, MEMBER_LIST_SQL } from "../lib/conversationSql.js";
import { shapeConversation, type Conversation, type StatsRow } from "../lib/conversations.js";
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
  const stats = listed.length ? await prisma.$queryRawUnsafe<StatsRow[]>(CONVERSATION_STATS_SQL, listed.map((c) => c.id)) : [];
  const byId = new Map(stats.map((s) => [s.id, s]));
  const now = Date.now();
  const conversations: Conversation[] = listed
    .map((c) => shapeConversation({ ...c, branch: c.branch ? { slug: c.branch.slug, name: c.branch.name } : null }, byId.get(c.id), now))
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.name.localeCompare(b.name));
  return { generatedAt: now, totals: { conversations: conversations.length, week: conversations.reduce((n, c) => n + c.week, 0) }, conversations };
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
