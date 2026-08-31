import { create } from "zustand";
import { api } from "./api";

export interface Emoji {
  id: number;
  name: string;
  imageUrl: string;
}

interface EmojiState {
  emojis: Emoji[];
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useEmojiStore = create<EmojiState>((set, get) => ({
  emojis: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    await get().refresh();
  },
  refresh: async () => {
    const emojis = await api<Emoji[]>("/api/emojis");
    set({ emojis, loaded: true });
  },
}));
