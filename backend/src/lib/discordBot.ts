import { Client, GatewayIntentBits, Partials } from "discord.js";
import { prisma } from "./prisma.js";
import { findOrCreateGhostUser } from "./discordImport.js";
import { toDayKey } from "./dayKey.js";
import { broadcast } from "./chatHub.js";
import { toMessageDTO } from "./messageDto.js";
import { resolveMentions, translateMentionsFromDiscord } from "./mentions.js";
import { createNotification } from "./notify.js";
import { saveMessageAttachment } from "./storage.js";

let client: Client | null = null;
let startedWithToken: string | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
let lastError: string | null = null;

export function getDiscordBridgeStatus(): { status: string; lastError: string | null } {
  return { status: connectionStatus, lastError };
}

/** Extracts the numeric webhook id from a Discord webhook URL
 *  (https://discord.com/api/webhooks/{id}/{token}) so incoming messages
 *  posted by our own webhook can be recognized and skipped — this is half
 *  of the feedback-loop prevention (the other half is the bot-account
 *  check below). */
function webhookIdFromUrl(url: string): string | null {
  const match = url.match(/\/webhooks\/(\d+)\//);
  return match ? match[1] : null;
}

async function handleIncomingDiscordMessage(message: {
  author: { id: string; username: string; bot: boolean };
  webhookId: string | null;
  channelId: string;
  id: string;
  content: string;
  createdAt: Date;
  attachments: { url: string; filename: string; contentType: string | null }[];
  referencedMessageId: string | null;
}) {
  // Feedback-loop prevention, part 1: never re-import anything the bot
  // account itself posted (the plain-bot-message fallback path).
  if (message.author.bot) return;

  const channel = await prisma.forumChannel.findUnique({ where: { discordChannelId: message.channelId } });
  if (!channel) return;

  // Feedback-loop prevention, part 2: never re-import anything posted
  // through our own configured webhook (the "{username} | Exo-API" path)
  // — a webhook message's author isn't flagged as a bot by Discord, so
  // the check above alone wouldn't catch it.
  if (channel.discordWebhookUrl && message.webhookId) {
    const ourWebhookId = webhookIdFromUrl(channel.discordWebhookUrl);
    if (ourWebhookId && message.webhookId === ourWebhookId) return;
  }

  // No text and no attachments — genuinely nothing to import (e.g. a
  // sticker-only message). Attachment-only messages now DO get imported.
  if (!message.content.trim() && message.attachments.length === 0) return;

  const importedFrom = `discord-live:${message.id}`;
  const existing = await prisma.message.findUnique({ where: { channelId_importedFrom: { channelId: channel.id, importedFrom } } });
  if (existing) return; // already processed this event (e.g. bot restart re-delivering recent history)

  const author = await findOrCreateGhostUser(prisma, message.author.id, message.author.username);
  const createdAt = message.createdAt;
  const dayKey = toDayKey(createdAt);
  const translatedContent = await translateMentionsFromDiscord(prisma, message.content);

  // Resolve a Discord reply back to a website message — either one that
  // originated on Discord itself (via the id embedded in importedFrom)
  // or one that started on the website and was forwarded out (via its
  // stored discordMessageId).
  let replyToId: number | null = null;
  if (message.referencedMessageId) {
    const referenced = await prisma.message.findFirst({
      where: {
        OR: [
          { channelId: channel.id, importedFrom: `discord-live:${message.referencedMessageId}` },
          { channelId: channel.id, discordMessageId: message.referencedMessageId },
        ],
      },
      select: { id: true },
    });
    replyToId = referenced?.id ?? null;
  }

  const messageInclude = {
    author: { select: { username: true, avatarUrl: true, isGhost: true, linkedUserId: true, linkedUser: { select: { username: true, avatarUrl: true } } } },
    reactions: { include: { emoji: true, user: { select: { username: true } } } },
    attachments: true,
    replyTo: { select: { id: true, contentRaw: true, author: { select: { username: true } } } },
  } as const;

  const created = await prisma.message.create({
    data: { channelId: channel.id, authorId: author.id, createdAt, dayKey, contentRaw: translatedContent, importedFrom, replyToId, discordMessageId: message.id },
    include: messageInclude,
  });

  // Download and save each Discord attachment as our own Attachment row,
  // linked to this message. Best-effort per file — one failure shouldn't
  // block the message import or the rest of the batch.
  if (message.attachments.length > 0) {
    for (const a of message.attachments) {
      try {
        const res = await fetch(a.url);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        const attachment = await saveMessageAttachment(author.id, a.filename, a.contentType ?? "application/octet-stream", buffer, { bypassQuota: true });
        await prisma.attachment.update({ where: { id: attachment.id }, data: { messageId: created.id } });
      } catch (err) {
        console.error("Discord bridge: failed to import attachment:", err);
      }
    }
  }

  const full = message.attachments.length > 0 ? await prisma.message.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude }) : created;
  const dto = await toMessageDTO(full);
  broadcast(channel.slug, { type: "message.create", message: dto });

  const mentioned = await resolveMentions(prisma, translatedContent, author.id);
  for (const m of mentioned) {
    if (m.isGhost) continue;
    void createNotification(
      m.id,
      "mention",
      `${dto.authorUsername} mentioned you`,
      `In ${channel.name}: ${translatedContent.slice(0, 120)}`,
      { channelSlug: channel.slug, messageId: created.id },
    ).catch((err) => console.error("Discord bridge: mention notification failed:", err));
  }
}

/** Posts a website message out to its linked Discord channel, if any.
 *  Call this after a message is successfully created on the website side
 *  — it's a no-op if the channel isn't bridged. Never throws; a Discord
 *  API hiccup shouldn't break sending a message on the website. */
/** Sends a DM to a user identified by Discord username, by searching every
 *  guild the bot is a member of for a matching member. Usernames aren't
 *  directly resolvable to a DM-able user without either a shared server
 *  (this) or a stored user id — since we only ask users for their
 *  username, this is the mechanism. Silently no-ops if the bot isn't
 *  connected, no username is given, or no match is found — notification
 *  delivery failures shouldn't ever break the action that triggered them. */
interface DiscordIdentity {
  discordUserId?: string | null;
  discordUsername?: string | null;
}

/** Resolves a Discord identity to an actual discord.js User object.
 *  Prefers a direct fetch by id (reliable, works without a shared guild
 *  or the Server Members intent) over searching guild members by
 *  username (the fallback, since usernames are what we ask most users
 *  for — but that path needs Server Members intent and a shared server). */
async function resolveDiscordUser(identity: DiscordIdentity) {
  if (!client) return null;
  if (identity.discordUserId) {
    try {
      return await client.users.fetch(identity.discordUserId);
    } catch (err) {
      console.warn(`Discord bridge: could not fetch user by id "${identity.discordUserId}":`, err);
    }
  }
  if (identity.discordUsername) {
    try {
      for (const guild of client.guilds.cache.values()) {
        const members = await guild.members.fetch();
        const match = members.find((m) => m.user.username.toLowerCase() === identity.discordUsername!.toLowerCase());
        if (match) return match.user;
      }
    } catch (err) {
      console.error("Discord bridge: failed to search guild members:", err);
    }
  }
  return null;
}

export async function sendDiscordDM(identity: DiscordIdentity, message: string): Promise<void> {
  if (!client || (!identity.discordUserId && !identity.discordUsername)) return;
  try {
    const user = await resolveDiscordUser(identity);
    if (!user) {
      console.warn(`Discord bridge: no user found for`, identity, `— DM not sent.`);
      return;
    }
    await user.send(message);
  } catch (err) {
    console.error("Discord bridge: failed to send DM:", err);
  }
}

/** Same identity resolution as sendDiscordDM, for borrowing a real
 *  Discord avatar on a forwarded message. */
export async function findDiscordAvatarUrl(identity: DiscordIdentity): Promise<string | null> {
  if (!client || (!identity.discordUserId && !identity.discordUsername)) return null;
  const user = await resolveDiscordUser(identity);
  return user?.displayAvatarURL({ size: 256 }) ?? null;
}

export type AnnouncementEvent = "join_applied" | "join_approved" | "news_published" | "calls_for_artists" | "calls_for_ideas";

/** Posts an admin-selected event announcement to the configured channel,
 *  as the bot itself — a no-op if no channel is set or this event type
 *  isn't one the admin enabled. */
export async function sendDiscordAnnouncement(event: AnnouncementEvent, message: string): Promise<void> {
  if (!client) return;
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!settings?.discordAnnounceChannelId) return;
    const enabled = (settings.discordAnnounceEvents as string[] | null) ?? [];
    if (!enabled.includes(event)) return;
    const channel = await client.channels.fetch(settings.discordAnnounceChannelId);
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send(message);
    }
  } catch (err) {
    console.error("Discord bridge: failed to send announcement:", err);
  }
}

export async function forwardMessageToDiscord(
  channelSlug: string,
  authorUsername: string,
  content: string,
  authorDiscordIdentity?: DiscordIdentity,
  options?: {
    attachments?: { url: string; filename: string }[];
    replyTo?: { discordMessageId: string | null; authorUsername: string; excerpt: string } | null;
  },
): Promise<string | null> {
  if (!client) return null;
  try {
    const channel = await prisma.forumChannel.findUnique({ where: { slug: channelSlug } });
    if (!channel?.discordChannelId) return null;

    const attachments = options?.attachments ?? [];
    const replyTo = options?.replyTo ?? null;

    // Webhooks only exist on a parent text channel — posting into a
    // thread or a forum post (which Discord implements as a thread under
    // the hood) requires this explicit thread_id, or the message lands
    // in the parent channel instead, silently. The bot-send path below
    // doesn't need this since ThreadChannel.send() already handles it.
    let threadIdParam = "";
    if (channel.discordWebhookUrl) {
      try {
        const targetChannel = await client.channels.fetch(channel.discordChannelId);
        if (targetChannel?.isThread()) threadIdParam = `&thread_id=${targetChannel.id}`;
      } catch (err) {
        console.error("Failed to check whether the target Discord channel is a thread:", err);
      }
    }

    if (channel.discordWebhookUrl) {
      const avatarUrl = authorDiscordIdentity ? await findDiscordAvatarUrl(authorDiscordIdentity) : null;
      // Webhooks can't use Discord's native reply feature (no shared
      // message-reference mechanism), so a reply is represented as a
      // plain quote line prepended to the content instead.
      const quotedContent = replyTo ? `> replying to **${replyTo.authorUsername}**: ${replyTo.excerpt}\n${content}` : content;

      let res: Response;
      if (attachments.length > 0) {
        // Discord's webhook endpoint needs actual file bytes in a
        // multipart body for real attachments — a plain JSON payload
        // can't reference a remote URL as a file the way discord.js's
        // bot-send path can, so each attachment is fetched from our own
        // storage first and re-uploaded as multipart form parts.
        const form = new FormData();
        form.append("payload_json", JSON.stringify({ username: `${authorUsername} | Exo-API`, content: quotedContent, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }));
        for (let i = 0; i < attachments.length; i++) {
          const a = attachments[i];
          const fileRes = await fetch(a.url);
          if (!fileRes.ok) continue;
          const blob = await fileRes.blob();
          form.append(`files[${i}]`, blob, a.filename);
        }
        res = await fetch(`${channel.discordWebhookUrl}?wait=true${threadIdParam}`, { method: "POST", body: form });
      } else {
        res = await fetch(`${channel.discordWebhookUrl}?wait=true${threadIdParam}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: `${authorUsername} | Exo-API`, content: quotedContent, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }),
        });
      }
      if (!res.ok) return null;
      const posted = (await res.json()) as { id: string };
      return posted.id;
    }

    const discordChannel = await client.channels.fetch(channel.discordChannelId);
    if (discordChannel?.isTextBased() && "send" in discordChannel) {
      const sent = await discordChannel.send({
        content: `${authorUsername}: ${content}`,
        files: attachments.map((a) => ({ attachment: a.url, name: a.filename })),
        ...(replyTo?.discordMessageId ? { reply: { messageReference: replyTo.discordMessageId } } : {}),
      });
      return sent.id;
    }
    return null;
  } catch (err) {
    console.error("Failed to forward message to Discord:", err);
    return null;
  }
}

/** Starts (or restarts, if the token changed) the Discord bot connection.
 *  Safe to call with no token — it's a no-op, and the bridge is simply
 *  inactive until one is configured in the admin panel. */
export async function initDiscordBot(): Promise<void> {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const token = settings?.discordBotToken;

  if (!token) {
    if (client) {
      await client.destroy();
      client = null;
      startedWithToken = null;
    }
    connectionStatus = "disconnected";
    lastError = null;
    console.log("Discord bridge: no token configured, bridge inactive.");
    return;
  }

  if (client && startedWithToken === token) return; // already running with this exact token

  if (client) {
    await client.destroy();
    client = null;
  }

  connectionStatus = "connecting";

  const newClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Message, Partials.Channel],
  });

  newClient.on("messageCreate", (message) => {
    handleIncomingDiscordMessage({
      author: { id: message.author.id, username: message.author.username, bot: message.author.bot },
      webhookId: message.webhookId,
      channelId: message.channelId,
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      attachments: [...message.attachments.values()].map((a) => ({ url: a.url, filename: a.name, contentType: a.contentType })),
      referencedMessageId: message.reference?.messageId ?? null,
    }).catch((err) => console.error("Discord bridge: failed to process incoming message:", err));
  });

  newClient.on("error", (err) => {
    connectionStatus = "error";
    lastError = err instanceof Error ? err.message : String(err);
    console.error("Discord client error:", err);
  });

  newClient.on("shardDisconnect", () => {
    connectionStatus = "disconnected";
    console.warn("Discord bridge: shard disconnected.");
  });

  try {
    await newClient.login(token);
    client = newClient;
    startedWithToken = token;
    connectionStatus = "connected";
    lastError = null;
    console.log("Discord bridge connected.");
  } catch (err) {
    connectionStatus = "error";
    lastError = err instanceof Error ? err.message : String(err);
    console.error("Discord bridge failed to connect — check the bot token:", err);
  }
}

/** Re-reads the token from SiteSettings and reconnects if it changed —
 *  call this after the admin saves a new token, rather than requiring a
 *  full server restart. */
export async function restartDiscordBotIfNeeded(): Promise<void> {
  await initDiscordBot();
}
