import { create } from "zustand";
import { useVolumeMixerStore } from "./volumeMixerStore";

const FADE_MS = 1500;
const TARGET_VOLUME = 0.35;

function fadeTo(audio: HTMLAudioElement, target: number) {
  const steps = 20;
  const start = audio.volume;
  let i = 0;
  const interval = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, start + ((target - start) * i) / steps));
    if (i >= steps) {
      clearInterval(interval);
      audio.volume = target;
      if (target === 0) audio.pause();
    }
  }, FADE_MS / steps);
}

interface AmbienceState {
  enabled: boolean;
  url: string | null;
  hasMainTrack: boolean;
  audio: HTMLAudioElement | null;
  setUrl: (url: string | null) => void;
  setEnabled: (enabled: boolean) => void;
  setHasMainTrack: (has: boolean) => void;
  pauseForNow: () => void;
}

function reevaluate() {
  const state = useAmbienceStore.getState();
  const shouldPlay = state.enabled && !!state.url && !state.hasMainTrack;

  if (shouldPlay) {
    let audio = state.audio;
    if (!audio || audio.src !== state.url) {
      audio?.pause();
      audio = new Audio(state.url!);
      audio.loop = true;
      audio.volume = 0;
      useAmbienceStore.setState({ audio });
    }
    if (audio.paused) {
      audio.volume = 0;
      audio.play().catch(() => {});
    }
    fadeTo(audio, TARGET_VOLUME * useVolumeMixerStore.getState().music);
  } else if (state.audio && !state.audio.paused) {
    fadeTo(state.audio, 0);
  }
}

export const useAmbienceStore = create<AmbienceState>((set) => ({
  enabled: typeof localStorage !== "undefined" ? localStorage.getItem("exomusica_ambience_enabled") !== "0" : true,
  url: null,
  hasMainTrack: false,
  audio: null,

  setUrl: (url) => {
    set({ url });
    reevaluate();
  },
  setEnabled: (enabled) => {
    localStorage.setItem("exomusica_ambience_enabled", enabled ? "1" : "0");
    set({ enabled });
    reevaluate();
  },
  setHasMainTrack: (hasMainTrack) => {
    set({ hasMainTrack });
    reevaluate();
  },
  // A deliberate, momentary stop (spacebar / pause button) — distinct from
  // unchecking "Exo-Ambience" outright. Since it doesn't touch `enabled`,
  // it'll fade back in the next time something naturally re-triggers it
  // (e.g. a real track starts and then finishes).
  pauseForNow: () => {
    const { audio } = useAmbienceStore.getState();
    if (audio && !audio.paused) fadeTo(audio, 0);
  },
}));
