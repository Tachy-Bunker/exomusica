import { create } from "zustand";
import { api } from "./api";

interface Conversation {
  unread: boolean;
}

interface ProfileState {
  avatarUrl: string | null;
  hasUnreadPms: boolean;
  setAvatarUrl: (url: string | null) => void;
  refresh: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  avatarUrl: null,
  hasUnreadPms: false,
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  refresh: async () => {
    const [me, conversations] = await Promise.all([
      api<{ avatarUrl: string | null }>("/api/account/me"),
      api<Conversation[]>("/api/pms"),
    ]);
    set({ avatarUrl: me.avatarUrl, hasUnreadPms: conversations.some((c) => c.unread) });
  },
}));
