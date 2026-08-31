import type { WebSocket } from "ws";

const rooms = new Map<string, Set<WebSocket>>();

export function subscribe(channelSlug: string, socket: WebSocket): void {
  if (!rooms.has(channelSlug)) rooms.set(channelSlug, new Set());
  rooms.get(channelSlug)!.add(socket);
  socket.on("close", () => rooms.get(channelSlug)?.delete(socket));
}

/** Push a server-authored event (a new/edited/deleted message) to everyone
 *  watching this channel. Clients never send chat content over the socket
 *  directly — sending goes through the authenticated REST endpoint, which
 *  persists first and calls this afterward. That's what makes messages
 *  durable and lets replies/reactions/embeds resolve before broadcast. */
export function broadcast(channelSlug: string, event: unknown): void {
  const peers = rooms.get(channelSlug);
  if (!peers) return;
  const payload = JSON.stringify(event);
  for (const peer of peers) {
    if (peer.readyState === peer.OPEN) peer.send(payload);
  }
}
