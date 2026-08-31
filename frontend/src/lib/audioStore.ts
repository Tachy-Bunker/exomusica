import { create } from "zustand";
import type { PlayableTrackDTO } from "./types";

interface AudioState {
  currentTrack: PlayableTrackDTO | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  play: (track: PlayableTrackDTO) => void;
  toggle: () => void;
  seek: (time: number) => void;
  setExpanded: (expanded: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  ended: () => void;
}

let audioEl: HTMLAudioElement | null = null;
export function bindAudioElement(el: HTMLAudioElement | null): void {
  audioEl = el;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  expanded: false,

  play: (track) => {
    const isSameTrack = get().currentTrack?.id === track.id;
    if (!isSameTrack) {
      set({ currentTrack: track, currentTime: 0, duration: 0 });
      if (audioEl) audioEl.src = track.fileUrl;
    }
    audioEl?.play().catch(() => set({ isPlaying: false }));
    set({ isPlaying: true });
  },

  toggle: () => {
    if (get().isPlaying) audioEl?.pause();
    else audioEl?.play().catch(() => {});
    set((s) => ({ isPlaying: !s.isPlaying }));
  },

  seek: (time) => {
    if (audioEl) audioEl.currentTime = time;
    set({ currentTime: time });
  },

  setExpanded: (expanded) => set({ expanded }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),
  ended: () => set({ isPlaying: false, currentTime: 0 }),
}));
