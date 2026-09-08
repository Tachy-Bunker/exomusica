import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MapQualityState {
  // 0.5–1.5 multiplier on the field renderer's pixel budget and DPR cap.
  // Defaults low so the common case is smooth; anyone on a capable
  // browser/machine can raise it themselves.
  quality: number;
  setQuality: (quality: number) => void;
  // Set once per session if WebGL is detected running on a software
  // rasterizer (see fieldRenderer.ts) — surfaced as an on-page notice,
  // since a console warning alone goes unseen by almost everyone.
  softwareRendererName: string | null;
  setSoftwareRendererName: (name: string | null) => void;
  hasAutoDowngraded: boolean;
}

export const useMapQualityStore = create<MapQualityState>()(
  persist(
    (set, get) => ({
      quality: 0.6,
      setQuality: (quality) => set({ quality }),
      softwareRendererName: null,
      hasAutoDowngraded: false,
      setSoftwareRendererName: (name) => {
        set({ softwareRendererName: name });
        // Auto-downgrade once per session, and only if this is the first
        // time it's been detected — never overrides a choice the user
        // makes afterward (e.g. raising it back up themselves).
        if (name && !get().hasAutoDowngraded) {
          set({ quality: Math.min(get().quality, 0.25), hasAutoDowngraded: true });
        }
      },
    }),
    { name: "exomusica_map_quality", partialize: (s) => ({ quality: s.quality }) },
  ),
);
