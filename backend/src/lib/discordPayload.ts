// What a website message looks like when it is posted to Discord. Pure, so it is tested without Discord.

/** Only the people the author actually mentioned may be pinged: never @everyone, @here or a role, whatever the message says. */
export function allowedMentions(userIds: string[] = []): { parse: ("users" | "roles" | "everyone")[]; users: string[] } {
  const users = [...new Set(userIds.filter((id) => /^\d{5,25}$/.test(id)))].slice(0, 100);
  return { parse: [], users };
}

export function webhookBody(o: { authorUsername: string; content: string; avatarUrl?: string | null; mentionUserIds?: string[] }) {
  return {
    username: `${o.authorUsername} | Exo-API`,
    content: o.content,
    ...(o.avatarUrl ? { avatar_url: o.avatarUrl } : {}),
    allowed_mentions: allowedMentions(o.mentionUserIds),
  };
}
