import { create } from "zustand";
import type { PlayableTrackDTO } from "./types";

type RepeatMode = "off" | "all" | "one";

interface AudioState {
  currentTrack: PlayableTrackDTO | null;
  queue: PlayableTrackDTO[]; // upcoming tracks, in play order
  history: PlayableTrackDTO[]; // played stack, most recent last — powers "previous"
  shuffle: boolean;
  repeatMode: RepeatMode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;

  play: (track: PlayableTrackDTO) => void;
  addToQueue: (tracks: PlayableTrackDTO[]) => void;
  clearQueue: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  seekBy: (deltaSeconds: number) => void;
  setExpanded: (expanded: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  ended: () => void;
}

let audioEl: HTMLAudioElement | null = null;
export function bindAudioElement(el: HTMLAudioElement | null): void {
  audioEl = el;
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  currentTrack: null,
  queue: [],
  history: [],
  shuffle: false,
  repeatMode: "off",
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

  addToQueue: (tracks) => set((s) => ({ queue: [...s.queue, ...(s.shuffle ? shuffleArray(tracks) : tracks)] })),
  clearQueue: () => set({ queue: [] }),

  playNext: () => {
    const { queue, currentTrack, history, repeatMode } = get();
    if (queue.length === 0) {
      // Repeat-all with an empty queue means "start the whole thing over"
      // rather than genuinely stopping.
      if (repeatMode === "all" && (history.length > 0 || currentTrack)) {
        const replay = currentTrack ? [...history, currentTrack] : history;
        const [next, ...rest] = replay;
        set({ history: [], queue: rest });
        if (next) get().play(next);
        return;
      }
      set({ isPlaying: false });
      return;
    }
    const [next, ...rest] = queue;
    set({ history: currentTrack ? [...history, currentTrack] : history, queue: rest });
    get().play(next);
  },

  playPrevious: () => {
    const { history, currentTrack, queue } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({ history: history.slice(0, -1), queue: currentTrack ? [currentTrack, ...queue] : queue });
    get().play(prev);
  },

  // Shuffling reorders what's already queued; turning it off just stops
  // applying it to future additions rather than trying to reconstruct the
  // pre-shuffle order — a reasonable simplification, not full undo.
  toggleShuffle: () =>
    set((s) => (s.shuffle ? { shuffle: false } : { shuffle: true, queue: shuffleArray(s.queue) })),

  cycleRepeat: () =>
    set((s) => ({ repeatMode: s.repeatMode === "off" ? "all" : s.repeatMode === "all" ? "one" : "off" })),

  toggle: () => {
    if (get().isPlaying) audioEl?.pause();
    else audioEl?.play().catch(() => {});
    set((s) => ({ isPlaying: !s.isPlaying }));
  },

  seek: (time) => {
    if (audioEl) audioEl.currentTime = time;
    set({ currentTime: time });
  },

  seekBy: (delta) => {
    const { currentTime, duration } = get();
    get().seek(Math.max(0, Math.min(duration || Infinity, currentTime + delta)));
  },

  setExpanded: (expanded) => set({ expanded }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),

  ended: () => {
    if (get().repeatMode === "one") {
      get().seek(0);
      audioEl?.play().catch(() => {});
      return;
    }
    get().playNext();
  },
}));
