import { Client, GatewayIntentBits, Partials } from "discord.js";
import { prisma } from "./prisma.js";
import { findOrCreateGhostUser } from "./discordImport.js";
import { toDayKey } from "./dayKey.js";
import { broadcast } from "./chatHub.js";
import { toMessageDTO } from "./messageDto.js";
import { resolveMentions, translateMentionsFromDiscord } from "./mentions.js";
import { createNotification } from "./notify.js";

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

  if (!message.content.trim()) return; // e.g. attachment-only messages with no text; nothing to import yet

  const importedFrom = `discord-live:${message.id}`;
  const existing = await prisma.message.findUnique({ where: { channelId_importedFrom: { channelId: channel.id, importedFrom } } });
  if (existing) return; // already processed this event (e.g. bot restart re-delivering recent history)

  const author = await findOrCreateGhostUser(prisma, message.author.id, message.author.username);
  const createdAt = message.createdAt;
  const dayKey = toDayKey(createdAt);
  const translatedContent = await translateMentionsFromDiscord(prisma, message.content);

  const created = await prisma.message.create({
    data: { channelId: channel.id, authorId: author.id, createdAt, dayKey, contentRaw: translatedContent, importedFrom },
    include: {
      author: { select: { username: true, avatarUrl: true, isGhost: true, linkedUserId: true, linkedUser: { select: { username: true, avatarUrl: true } } } },
      reactions: { include: { emoji: true, user: { select: { username: true } } } },
      attachments: true,
      replyTo: { select: { id: true, contentRaw: true, author: { select: { username: true } } } },
    },
  });

  const dto = await toMessageDTO(created);
  broadcast(channel.slug, { type: "message.create", message: dto });

  const mentioned = await resolveMentions(prisma, translatedContent, author.id);
  for (const m of mentioned) {
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
): Promise<void> {
  if (!client) return;
  try {
    const channel = await prisma.forumChannel.findUnique({ where: { slug: channelSlug } });
    if (!channel?.discordChannelId) return;

    if (channel.discordWebhookUrl) {
      const avatarUrl = authorDiscordIdentity ? await findDiscordAvatarUrl(authorDiscordIdentity) : null;
      await fetch(channel.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: `${authorUsername} | Exo-API`, content, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }),
      });
      return;
    }

    const discordChannel = await client.channels.fetch(channel.discordChannelId);
    if (discordChannel?.isTextBased() && "send" in discordChannel) {
      await discordChannel.send(`${authorUsername}: ${content}`);
    }
  } catch (err) {
    console.error("Failed to forward message to Discord:", err);
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
