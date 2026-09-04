import type { PrismaClient } from "@prisma/client";

/** Extracts @username tokens from message content. Usernames on this site
 *  are alphanumeric plus underscore/dot/hyphen, so the token boundary is
 *  anything else (whitespace, punctuation, end of string). */
export function extractMentionedUsernames(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

/** Resolves @username mentions in freshly-authored website content to the
 *  actual users being mentioned (active accounts only — mentioning a
 *  ghost doesn't notify anyone, since ghosts can't log in to see it).
 *  Excludes the author mentioning themselves. */
export async function resolveMentions(
  prisma: PrismaClient,
  content: string,
  authorId: number,
): Promise<{ id: number; username: string; discordUserId: string | null; discordUsername: string | null }[]> {
  const usernames = extractMentionedUsernames(content);
  if (usernames.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: usernames, mode: "insensitive" }, isGhost: false, id: { not: authorId } },
    select: { id: true, username: true, discordUserId: true, discordUsername: true },
  });
  return users;
}

/** Converts @username mentions to Discord's <@snowflakeId> mention syntax
 *  before forwarding a website message to Discord, for every mentioned
 *  user who has a Discord identity on file. Mentions of users without one
 *  are left as plain text (mentioning them just wasn't resolvable). */
export function translateMentionsForDiscord(
  content: string,
  mentioned: { username: string; discordUserId: string | null }[],
): string {
  let result = content;
  for (const m of mentioned) {
    if (!m.discordUserId) continue;
    result = result.replace(new RegExp(`@${m.username}\\b`, "gi"), `<@${m.discordUserId}>`);
  }
  return result;
}

/** Converts Discord's <@snowflakeId> mentions to website @username mentions
 *  before storing an incoming live-bridged Discord message — so a reader
 *  on the website sees a real, resolvable @username rather than a raw id,
 *  and so the standard mention-notification logic picks it up. Resolves
 *  through the ghost/linked-user system: a mentioned Discord user with a
 *  linked real account resolves to that account's username; otherwise to
 *  their ghost's username, if one exists yet. Unresolvable ids are left
 *  as-is rather than guessed at. */
export async function translateMentionsFromDiscord(prisma: PrismaClient, content: string): Promise<string> {
  const ids = [...new Set([...content.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]))];
  if (ids.length === 0) return content;

  const ghosts = await prisma.user.findMany({
    where: { discordId: { in: ids } },
    select: { discordId: true, username: true, linkedUser: { select: { username: true } } },
  });
  const byDiscordId = new Map(ghosts.map((g) => [g.discordId as string, g.linkedUser?.username ?? g.username]));

  let result = content;
  for (const id of ids) {
    const username = byDiscordId.get(id);
    if (username) result = result.replace(new RegExp(`<@!?${id}>`, "g"), `@${username}`);
  }
  return result;
}
