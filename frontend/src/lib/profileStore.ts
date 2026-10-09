import { create } from "zustand";
import { api } from "./api";

interface Conversation {
  unread: boolean;
}

interface ProfileState {
  avatarUrl: string | null;
  hasUnreadPms: boolean;
  /** PM conversations with something new in them (letters are counted by the Faceplate's own poll) */
  unreadPms: number;
  setAvatarUrl: (url: string | null) => void;
  refresh: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  avatarUrl: null,
  hasUnreadPms: false,
  unreadPms: 0,
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  refresh: async () => {
    const [me, conversations] = await Promise.all([
      api<{ avatarUrl: string | null }>("/api/account/me"),
      api<Conversation[]>("/api/pms"),
    ]);
    const list = Array.isArray(conversations) ? conversations : [];
    const letters = await api<{ n: number }>("/api/letters/unread").then((r) => Number(r?.n) || 0).catch(() => 0);
    const unreadPms = list.filter((c) => c.unread).length;
    set({ avatarUrl: me.avatarUrl, unreadPms, hasUnreadPms: unreadPms > 0 || letters > 0 });
  },
}));
