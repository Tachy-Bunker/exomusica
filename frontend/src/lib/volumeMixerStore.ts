import { create } from "zustand";
import { api } from "./api";
import { setMusicVolume } from "./audioStore";

interface VolumeMixerState {
  notifications: number; // 0..1
  sfx: number;
  music: number;
  loaded: boolean;
  load: () => Promise<void>;
  setVolume: (key: "notifications" | "sfx" | "music", value: number) => void;
  save: () => Promise<void>;
}

export const useVolumeMixerStore = create<VolumeMixerState>((set, get) => ({
  notifications: 0.8,
  sfx: 1,
  music: 1,
  loaded: false,

  load: async () => {
    const me = await api<{ volumeNotifications: number; volumeSfx: number; volumeMusic: number }>("/api/account/me");
    set({ notifications: me.volumeNotifications, sfx: me.volumeSfx, music: me.volumeMusic, loaded: true });
    setMusicVolume(me.volumeMusic);
  },

  setVolume: (key, value) => {
    set({ [key]: value } as Partial<VolumeMixerState>);
    if (key === "music") setMusicVolume(value);
  },

  save: async () => {
    const { notifications, sfx, music } = get();
    await api("/api/account/volume-mixer", {
      method: "PATCH",
      body: JSON.stringify({ volumeNotifications: notifications, volumeSfx: sfx, volumeMusic: music }),
    });
  },
}));
