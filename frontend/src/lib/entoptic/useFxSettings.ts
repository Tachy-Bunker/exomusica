import { useEffect, useState } from "react";
import { api } from "../api";
import { FX_DEFAULTS, type FxSettings } from "./useSpacemapField";

export function useFxSettings(): FxSettings {
  const [settings, setSettings] = useState<FxSettings>(FX_DEFAULTS);

  useEffect(() => {
    api<{
      spacingMultiplier: number;
      debrisCount: number;
      wardenSizeMin: number;
      wardenSizeMax: number;
      split: number;
      chaos: number;
      drift: number;
      lurk: number;
      bgBright: number;
      bgSat: number;
      bgContrast: number;
      staticAmt: number;
      staticSpeed: number;
      vignette: number;
      caInitial: number;
      caBurst: number;
      wardenHue: number;
      trailAmt: number;
      wardenReveal: number;
      wardenHuskBright: number;
      wardenOrbBright: number;
      glowHue: number;
      glowSat: number;
      glowBright: number;
      rmsBrightnessAmount: number;
    }>("/api/fx-settings").then((s) => setSettings(s));
  }, []);

  return settings;
}
