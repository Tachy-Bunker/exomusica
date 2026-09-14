import type { WebSocket } from "ws";

interface PresenceEntry {
  socket: WebSocket;
  userId: number;
  username: string;
  viewingChannelSlug: string | null;
}

const entries = new Set<PresenceEntry>();

// Set periodically by the Discord bridge (see discordBot.ts) from that
// guild's actual online member count — blended into the website's own
// count below rather than tracked or exposed as a separate figure, per
// the deliberate choice not to reveal where any of it came from.
let discordOnlineCount = 0;

export function setDiscordOnlineCount(count: number): void {
  discordOnlineCount = count;
  broadcastSnapshot();
}

export function registerPresence(socket: WebSocket, userId: number, username: string): PresenceEntry {
  const entry: PresenceEntry = { socket, userId, username, viewingChannelSlug: null };
  entries.add(entry);
  broadcastSnapshot();
  return entry;
}

export function unregisterPresence(entry: PresenceEntry): void {
  entries.delete(entry);
  broadcastSnapshot();
}

export function setViewing(entry: PresenceEntry, channelSlug: string | null): void {
  entry.viewingChannelSlug = channelSlug;
  broadcastSnapshot();
}

function snapshot() {
  const onlineUserIds = new Set([...entries].map((e) => e.userId));
  const viewers: { channelSlug: string; username: string }[] = [];
  for (const e of entries) {
    if (e.viewingChannelSlug) viewers.push({ channelSlug: e.viewingChannelSlug, username: e.username });
  }
  return { onlineCount: onlineUserIds.size + discordOnlineCount, viewers };
}

function broadcastSnapshot(): void {
  const payload = JSON.stringify(snapshot());
  for (const e of entries) {
    if (e.socket.readyState === e.socket.OPEN) e.socket.send(payload);
  }
}
