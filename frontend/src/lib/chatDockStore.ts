import { create } from "zustand";
import { persist } from "zustand/middleware";
import { dialOrder, freeSlot, pin, removeScene, saveScene, touchRecent, toggleSleep, tune, unpin, type Room, type Scene } from "./rooms";

interface ChatDockState {
  openChannelSlug: string | null;
  openChannelName: string | null;
  openBranchSlug: string | null;
  collapsed: boolean;
  width: number;
  pageChannel: { slug: string; name: string; branchSlug?: string } | null;
  suppressGlobalEShortcut: boolean;
  recents: Room[];
  presets: (Room | null)[];
  scenes: Scene[];
  switcherOpen: boolean;
  setSwitcher: (open: boolean) => void;
  sleepSlot: (i: number) => void;
  saveSceneAs: (name: string) => void;
  applyScene: (name: string) => void;
  deleteScene: (name: string) => void;
  hydrateDial: (d: { presets: (Room | null)[]; scenes: Scene[] }) => void;
  pinRoom: (i: number, room?: Room) => void;
  unpinRoom: (i: number) => void;
  tuneRoom: (dir: 1 | -1) => void;
  openSlot: (i: number) => void;
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
      recents: [],
      presets: [null, null, null, null, null, null],
      scenes: [],
      switcherOpen: false,
      setSwitcher: (open) => set({ switcherOpen: open }),
      sleepSlot: (i) => set((s) => ({ presets: toggleSleep(s.presets, i) })),
      saveSceneAs: (name) => set((s) => ({ scenes: saveScene(s.scenes, name, s.presets) })),
      applyScene: (name) => set((s) => { const sc = s.scenes.find((x) => x.name.toLowerCase() === name.toLowerCase()); return sc ? { presets: sc.slots.map((r) => (r ? { ...r } : null)) } : s; }),
      deleteScene: (name) => set((s) => ({ scenes: removeScene(s.scenes, name) })),
      hydrateDial: (d) => set({ presets: d.presets, scenes: d.scenes }),
      // Deliberately a plain replace, not append - the spec is one chatbox
      // at a time, so opening a different branch's chat just swaps the
      // content.
      openChat: (slug, name, branchSlug) =>
        set((s) => ({ openChannelSlug: slug, openChannelName: name, openBranchSlug: branchSlug ?? null, collapsed: false, recents: touchRecent(s.recents, { slug, name, branchSlug }) })),
      // The dial of rooms (lib/rooms.ts): 6 pinned slots, then the rooms you used lately.
      pinRoom: (i, room) => set((s) => {
        const r = room ?? (s.openChannelSlug ? { slug: s.openChannelSlug, name: s.openChannelName ?? s.openChannelSlug, branchSlug: s.openBranchSlug ?? undefined } : null);
        if (!r) return s;
        const at = i < 0 ? freeSlot(s.presets) : i;
        return at < 0 ? s : { presets: pin(s.presets, at, r) };
      }),
      unpinRoom: (i) => set((s) => ({ presets: unpin(s.presets, i) })),
      tuneRoom: (dir) => set((s) => {
        const next = tune(dialOrder(s.presets, s.recents), s.openChannelSlug, dir);
        return next ? { openChannelSlug: next.slug, openChannelName: next.name, openBranchSlug: next.branchSlug ?? null, collapsed: false, recents: touchRecent(s.recents, next) } : s;
      }),
      openSlot: (i) => set((s) => {
        const r = s.presets[i]; if (!r) return s;
        return { openChannelSlug: r.slug, openChannelName: r.name, openBranchSlug: r.branchSlug ?? null, collapsed: false, recents: touchRecent(s.recents, r) };
      }),
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
        recents: s.recents,
        presets: s.presets,
        scenes: s.scenes,
      }),
    },
  ),
);
