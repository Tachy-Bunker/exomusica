import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MapQualityState {
  // 0.5–1.5 multiplier on the field renderer's pixel budget and DPR cap.
  // Defaults low so the common case is smooth; anyone on a capable
  // browser/machine can raise it themselves.
  quality: number;
  setQuality: (quality: number) => void;
}

export const useMapQualityStore = create<MapQualityState>()(
  persist(
    (set) => ({
      quality: 0.6,
      setQuality: (quality) => set({ quality }),
    }),
    { name: "exomusica_map_quality" },
  ),
);
