import { create } from "zustand";
import { api } from "./api";
import { setMusicVolume, useAudioStore } from "./audioStore";
import { useSiteEffectsStore } from "./siteEffectsStore";

interface VolumeMixerState {
  notifications: number; // 0..1
  sfxIdle: number; // SFX volume when nothing is playing
  sfxPlaying: number; // SFX volume while music is playing — ducked
  music: number;
  loaded: boolean;
  load: () => Promise<void>;
  setVolume: (key: "notifications" | "sfxIdle" | "sfxPlaying" | "music", value: number) => void;
  save: () => Promise<void>;
}

export const useVolumeMixerStore = create<VolumeMixerState>((set, get) => ({
  notifications: 0.8,
  sfxIdle: 0.8,
  sfxPlaying: 0.6,
  music: 1,
  loaded: false,

  load: async () => {
    const me = await api<{ volumeNotifications: number; volumeSfxIdle: number; volumeSfxPlaying: number; volumeMusic: number }>(
      "/api/account/me",
    );
    set({ notifications: me.volumeNotifications, sfxIdle: me.volumeSfxIdle, sfxPlaying: me.volumeSfxPlaying, music: me.volumeMusic, loaded: true });
    setMusicVolume(me.volumeMusic);
  },

  setVolume: (key, value) => {
    set({ [key]: value } as Partial<VolumeMixerState>);
    if (key === "music") setMusicVolume(value);
  },

  save: async () => {
    const { notifications, sfxIdle, sfxPlaying, music } = get();
    await api("/api/account/volume-mixer", {
      method: "PATCH",
      body: JSON.stringify({ volumeNotifications: notifications, volumeSfxIdle: sfxIdle, volumeSfxPlaying: sfxPlaying, volumeMusic: music }),
    });
  },
}));

/** The SFX volume to actually use right now — idle or ducked, depending on
 *  whether a track is currently playing. Every SFX call site should read
 *  this instead of a single flat value. */
export function getCurrentSfxVolume(): number {
  const { sfxIdle, sfxPlaying } = useVolumeMixerStore.getState();
  return useAudioStore.getState().currentTrack ? sfxPlaying : sfxIdle;
}

/** Plays the admin-configured link-click sound, if one is set. Used by the
 *  global <a> click listener in Layout, and directly by anything that
 *  navigates without a real <a> tag (e.g. spacemap branch nodes, which are
 *  clickable divs) so link-click sound coverage isn't limited to actual
 *  anchor elements. */
export function playLinkClickSound(): void {
  const url = useSiteEffectsStore.getState().linkClickSfxUrl;
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = getCurrentSfxVolume();
  audio.play().catch(() => {});
}
