// The two aggregate queries behind the Conversations hub and the Members directory.
// They are plain strings so the same text can be run against a real database in tests.
// Prisma stores DateTime as "timestamp without time zone" in UTC, so every window is anchored with now() AT TIME ZONE 'UTC'.

/** $1 = channel ids (int[]). One row per id, with zeros for a chat nobody has written in. */
export const CONVERSATION_STATS_SQL = `
WITH stats AS (
  SELECT m."channelId" AS cid,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE m."createdAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours') AS day,
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
       COALESCE(s.day, 0)::int AS day,
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

/** How many days of trace the instrument view draws (today is the last one). */
export const TRACE_DAYS = 14;

/** $1 = channel ids. Messages per chat per UTC day for the last 14 days: `ago` is 0 for today, 13 for thirteen days ago. */
export const CONVERSATION_TRACE_SQL = `
SELECT m."channelId"::int AS id,
       ((now() AT TIME ZONE 'UTC')::date - m."createdAt"::date)::int AS ago,
       COUNT(*)::int AS n
FROM "Message" m
WHERE m."isDeleted" = false
  AND m."channelId" = ANY($1::int[])
  AND m."createdAt" >= (now() AT TIME ZONE 'UTC')::date - ${TRACE_DAYS - 1}
GROUP BY 1, 2
`;

/** $1 = channel ids (only chats the public may see). The newest messages across them, for the live feed. */
export const RECENT_MESSAGES_SQL = `
SELECT m.id::int AS id,
       c.slug AS channel_slug,
       c.name AS channel_name,
       b.slug AS branch_slug,
       u.username,
       m."contentRaw" AS text,
       m."createdAt" AS at,
       (SELECT string_agg(a.filename, E'\\n' ORDER BY a.id) FROM "Attachment" a WHERE a."messageId" = m.id) AS files
FROM "Message" m
JOIN "ForumChannel" c ON c.id = m."channelId"
LEFT JOIN "Branch" b ON b.id = c."branchId"
JOIN "User" u ON u.id = m."authorId"
WHERE m."isDeleted" = false AND m."channelId" = ANY($1::int[])
ORDER BY m."createdAt" DESC, m.id DESC
LIMIT 14
`;

/** $1 = user id. One member's messages in chats the public may read, per UTC day (`ago`); the row with a null `ago` is the all-time total. */
export const MEMBER_STATS_SQL = `
SELECT x.ago, COUNT(*)::int AS total
FROM (
  SELECT ((now() AT TIME ZONE 'UTC')::date - m."createdAt"::date)::int AS ago
  FROM "Message" m
  JOIN "ForumChannel" c ON c.id = m."channelId"
  LEFT JOIN "Branch" b ON b.id = c."branchId"
  WHERE m."isDeleted" = false AND m."authorId" = $1
    AND (c."branchId" IS NULL OR b.visibility <> 'HIDDEN')
) x
GROUP BY ROLLUP (x.ago)
`;
