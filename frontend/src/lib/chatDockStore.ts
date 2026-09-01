import { create } from "zustand";

interface ChatDockState {
  openChannelSlug: string | null;
  openChannelName: string | null;
  collapsed: boolean;
  width: number;
  openChat: (slug: string, name: string) => void;
  close: () => void;
  toggleCollapse: () => void;
  setWidth: (width: number) => void;
}

export const useChatDockStore = create<ChatDockState>((set) => ({
  openChannelSlug: null,
  openChannelName: null,
  collapsed: false,
  width: Math.round(window.innerWidth * 0.4),
  // Deliberately a plain replace, not append — the spec is one chatbox at
  // a time, so opening a different branch's chat just swaps the content.
  openChat: (slug, name) => set({ openChannelSlug: slug, openChannelName: name, collapsed: false }),
  close: () => set({ openChannelSlug: null }),
  toggleCollapse: () => set((s) => ({ collapsed: !s.collapsed })),
  setWidth: (width) => set({ width: Math.min(window.innerWidth * 0.7, Math.max(280, width)) }),
}));
