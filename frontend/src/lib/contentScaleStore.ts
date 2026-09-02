import { create } from "zustand";

interface ContentScaleState {
  desktop: number;
  mobile: number;
  setScale: (desktop: number, mobile: number) => void;
}

export const useContentScaleStore = create<ContentScaleState>((set) => ({
  desktop: 2.0,
  mobile: 1.6,
  setScale: (desktop, mobile) => set({ desktop, mobile }),
}));
