import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatDockState {
  openChannelSlug: string | null;
  openChannelName: string | null;
  openBranchSlug: string | null;
  collapsed: boolean;
  width: number;
  pageChannel: { slug: string; name: string; branchSlug?: string } | null;
  suppressGlobalEShortcut: boolean;
  openChat: (slug: string, name: string, branchSlug?: string) => void;
  close: () => void;
  toggleCollapse: () => void;
  setWidth: (width: number) => void;
  setPageChannel: (channel: { slug: string; name: string; branchSlug?: string } | null) => void;
  setSuppressGlobalEShortcut: (suppress: boolean) => void;
}

export const useChatDockStore = create<ChatDockState>()(
  persist(
    (set) => ({
      openChannelSlug: null,
      openChannelName: null,
      openBranchSlug: null,
      collapsed: false,
      width: Math.round(window.innerWidth * 0.4),
      pageChannel: null,
      suppressGlobalEShortcut: false,
      // Deliberately a plain replace, not append - the spec is one chatbox
      // at a time, so opening a different branch's chat just swaps the
      // content.
      openChat: (slug, name, branchSlug) =>
        set({ openChannelSlug: slug, openChannelName: name, openBranchSlug: branchSlug ?? null, collapsed: false }),
      // Fully hides the dock - distinct from collapse, which keeps the
      // channel remembered and just minimizes. This is what the dock's
      // own X button does; E and the "_" button still just collapse.
      close: () => set({ openChannelSlug: null, openChannelName: null, openBranchSlug: null, collapsed: false }),
      toggleCollapse: () => set((s) => ({ collapsed: !s.collapsed })),
      setWidth: (width) => set({ width: Math.min(window.innerWidth * 0.7, Math.max(280, width)) }),
      setPageChannel: (channel) => set({ pageChannel: channel }),
      setSuppressGlobalEShortcut: (suppress) => set({ suppressGlobalEShortcut: suppress }),
    }),
    {
      name: "exomusica_chat_dock",
      partialize: (s) => ({
        openChannelSlug: s.openChannelSlug,
        openChannelName: s.openChannelName,
        openBranchSlug: s.openBranchSlug,
        collapsed: s.collapsed,
        width: s.width,
      }),
    },
  ),
);
