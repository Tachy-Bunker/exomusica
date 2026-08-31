import type { Message, Reaction, CustomEmoji, User, Attachment } from "@prisma/client";
import { resolveTrackEmbeds } from "./embeds.js";
import type { MessageDTO } from "./types.js";

type MessageWithRelations = Message & {
  author: Pick<User, "username" | "avatarUrl">;
  reactions: (Reaction & { emoji: CustomEmoji; user: Pick<User, "username"> })[];
  attachments: Attachment[];
  replyTo: (Pick<Message, "id" | "contentRaw"> & { author: Pick<User, "username"> }) | null;
};

export async function toMessageDTO(message: MessageWithRelations): Promise<MessageDTO> {
  const reactionsByEmoji = new Map<number, { emojiName: string; usernames: string[] }>();
  for (const r of message.reactions) {
    const entry = reactionsByEmoji.get(r.emojiId) ?? { emojiName: r.emoji.name, usernames: [] };
    entry.usernames.push(r.user.username);
    reactionsByEmoji.set(r.emojiId, entry);
  }

  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    authorUsername: message.author.username,
    authorAvatarUrl: message.author.avatarUrl,
    unixTimestamp: Math.floor(message.createdAt.getTime() / 1000),
    replyToId: message.replyToId,
    replyPreview: message.replyTo
      ? { id: message.replyTo.id, authorUsername: message.replyTo.author.username, excerpt: message.replyTo.contentRaw.slice(0, 80) }
      : null,
    contentRaw: message.isDeleted ? "" : message.contentRaw,
    attachments: message.isDeleted
      ? []
      : message.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          url: a.storagePath,
          sizeBytes: Number(a.sizeBytes),
        })),
    isDeleted: message.isDeleted,
    editedAt: message.editedAt ? Math.floor(message.editedAt.getTime() / 1000) : null,
    reactions: [...reactionsByEmoji.entries()].map(([emojiId, v]) => ({
      emojiId,
      emojiName: v.emojiName,
      usernames: v.usernames,
    })),
    embeds: message.isDeleted ? [] : await resolveTrackEmbeds(message.contentRaw),
  };
}
