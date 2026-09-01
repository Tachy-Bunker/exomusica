import { create } from "zustand";
import { getToken } from "./api";

interface PresenceState {
  onlineCount: number;
  viewersByChannel: Map<string, string[]>; // channelSlug -> usernames currently viewing it
  socket: WebSocket | null;
  connect: () => void;
  reportViewing: (channelSlug: string | null) => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineCount: 0,
  viewersByChannel: new Map(),
  socket: null,

  connect: () => {
    if (get().socket) return; // already connected this session
    const token = getToken();
    if (!token) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${location.host}/ws/presence?token=${encodeURIComponent(token)}`);

    socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as { onlineCount: number; viewers: { channelSlug: string; username: string }[] };
      const byChannel = new Map<string, string[]>();
      for (const v of data.viewers) {
        const list = byChannel.get(v.channelSlug) ?? [];
        list.push(v.username);
        byChannel.set(v.channelSlug, list);
      }
      set({ onlineCount: data.onlineCount, viewersByChannel: byChannel });
    };

    socket.onclose = () => set({ socket: null });

    set({ socket });
  },

  reportViewing: (channelSlug) => {
    const socket = get().socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "viewing", channelSlug }));
    }
  },
}));
