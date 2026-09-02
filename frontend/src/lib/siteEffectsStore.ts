import { create } from "zustand";

interface SiteEffectsState {
  caInitial: number;
  caBurst: number;
  chatOpenSfxUrl: string | null;
  moireImageUrl: string | null;
  moireOpacity: number;
  moireSize: number;
  moireOffsetMin: number;
  moireOffsetMax: number;
  moireOffsetSpeed: number;
  moireWaveform: "sine" | "triangle";
  moireRotationSpeed: number;
  setEffects: (v: Partial<Omit<SiteEffectsState, "setEffects">>) => void;
}

export const useSiteEffectsStore = create<SiteEffectsState>((set) => ({
  caInitial: 0.15,
  caBurst: 0.6,
  chatOpenSfxUrl: null,
  moireImageUrl: null,
  moireOpacity: 0.15,
  moireSize: 1,
  moireOffsetMin: 0,
  moireOffsetMax: 20,
  moireOffsetSpeed: 0.3,
  moireWaveform: "sine",
  moireRotationSpeed: 0.1,
  setEffects: (v) => set(v),
}));
