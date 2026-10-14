import { useEffect } from "react";
import { applyEra, eraOf, useEra } from "./era";
import { watchHum } from "./eraHum";
import { loadMilestones } from "./milestones";
import { useClassicMode } from "./classicMode";
import { useSkin } from "./skin";

/** Reads the site's age once a minute at most (the milestone list is cached) and, when Season shift is unlocked, dresses the page for the current era and runs the optional hum. */
export function useSeasonShift(): void {
  useEffect(() => {
    let live = true;
    void loadMilestones().then((l) => {
      if (!live) return;
      const m = l.find((x) => x.key === "m-season");
      const unlocked = !!m?.reached, days = m?.now ?? 0, era = unlocked ? eraOf(days) : null;
      useEra.getState().set({ era, days, unlocked });
      applyEra(era, !!useSkin.getState().skin);
    }).catch(() => undefined);
    const stop = watchHum(() => ({ on: useEra.getState().hum, unlocked: useEra.getState().unlocked, classic: useClassicMode.getState().classic, era: useEra.getState().era }));
    return () => { live = false; stop(); };
  }, []);
}
