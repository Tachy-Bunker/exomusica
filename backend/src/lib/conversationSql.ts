// The two aggregate queries behind the Conversations hub and the Members directory.
// They are plain strings so the same text can be run against a real database in tests.
// Prisma stores DateTime as "timestamp without time zone" in UTC, so every window is anchored with now() AT TIME ZONE 'UTC'.

/** $1 = channel ids (int[]). One row per id, with zeros for a chat nobody has written in. */
export const CONVERSATION_STATS_SQL = `
WITH stats AS (
  SELECT m."channelId" AS cid,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE m."createdAt" > (now() AT TIME ZONE 'UTC') - interval '7 days') AS week,
         COUNT(DISTINCT m."authorId") FILTER (WHERE m."createdAt" > (now() AT TIME ZONE 'UTC') - interval '30 days') AS voices
  FROM "Message" m
  WHERE m."isDeleted" = false AND m."channelId" = ANY($1::int[])
  GROUP BY m."channelId"
), last AS (
  SELECT DISTINCT ON (m."channelId") m."channelId" AS cid, m."contentRaw", m."createdAt", u.username,
         (SELECT string_agg(a.filename, E'\\n' ORDER BY a.id) FROM "Attachment" a WHERE a."messageId" = m.id) AS files
  FROM "Message" m
  JOIN "User" u ON u.id = m."authorId"
  WHERE m."isDeleted" = false AND m."channelId" = ANY($1::int[])
  ORDER BY m."channelId", m."createdAt" DESC, m.id DESC
)
SELECT c.id::int AS id,
       COALESCE(s.total, 0)::int AS total,
       COALESCE(s.week, 0)::int AS week,
       COALESCE(s.voices, 0)::int AS voices,
       l."contentRaw" AS last_text,
       l."createdAt" AS last_at,
       l.username AS last_by,
       l.files AS last_files
FROM unnest($1::int[]) AS c(id)
LEFT JOIN stats s ON s.cid = c.id
LEFT JOIN last l ON l.cid = c.id
`;

/**
 * Real accounts only (no ghosts, no deleted accounts), each with how many studies they own and how many messages they wrote in the
 * last 30 days in chats the public may read. The message count is one pass over the messages, not one search per member.
 */
export const MEMBER_LIST_SQL = `
WITH msgs AS (
  SELECT m."authorId" AS uid, COUNT(*) AS n
  FROM "Message" m
  JOIN "ForumChannel" c ON c.id = m."channelId"
  LEFT JOIN "Branch" b ON b.id = c."branchId"
  WHERE m."isDeleted" = false
    AND m."createdAt" > (now() AT TIME ZONE 'UTC') - interval '30 days'
    AND (c."branchId" IS NULL OR b.visibility <> 'HIDDEN')
  GROUP BY m."authorId"
), studies AS (
  SELECT s."ownerId" AS uid, COUNT(*) AS n FROM "Study" s GROUP BY s."ownerId"
)
SELECT u.username, u."avatarUrl", u.bio, u."createdAt",
       COALESCE(st.n, 0)::int AS studies,
       COALESCE(ms.n, 0)::int AS messages
FROM "User" u
LEFT JOIN msgs ms ON ms.uid = u.id
LEFT JOIN studies st ON st.uid = u.id
WHERE u."isGhost" = false AND u."deletedAt" IS NULL
ORDER BY u."createdAt" DESC, u.id DESC
LIMIT 1000
`;
