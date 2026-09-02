import { create } from "zustand";

interface SiteEffectsState {
  caInitial: number;
  caBurst: number;
  staticAmt: number;
  staticSpeed: number;
  setEffects: (v: Partial<Omit<SiteEffectsState, "setEffects">>) => void;
}

export const useSiteEffectsStore = create<SiteEffectsState>((set) => ({
  caInitial: 0.15,
  caBurst: 0.6,
  staticAmt: 0.18,
  staticSpeed: 0.55,
  setEffects: (v) => set(v),
}));
