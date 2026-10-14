import { create } from "zustand";
/** Probe mode is a moment, not a setting: it starts off on every page load. The lens (how the page is read) goes back to normal whenever Probe goes off. */
export type Lens = "normal" | "thermal" | "xray";
export const useProbeStore = create<{ on: boolean; lens: Lens; set: (v: boolean) => void; toggle: () => void; setLens: (l: Lens) => void }>((set, get) => ({
  on: false,
  lens: "normal",
  set: (on) => set(on ? { on } : { on, lens: "normal" }),
  toggle: () => get().set(!get().on),
  setLens: (lens) => set({ lens }),
}));
