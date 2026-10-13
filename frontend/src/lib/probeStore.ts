import { create } from "zustand";
/** Probe mode is a moment, not a setting: it starts off on every page load. */
export const useProbeStore = create<{ on: boolean; set: (v: boolean) => void; toggle: () => void }>((set, get) => ({
  on: false,
  set: (on) => set({ on }),
  toggle: () => set({ on: !get().on }),
}));
