import { create } from "zustand";
// Classic mode: one switch that turns off every playful overlay, animation and sound the Probe/Field Log layer adds.
// If the person never chose, it starts ON for people who asked for less motion and for weak or data-saving devices.
const KEY = "exomusica_classic";
const nav = (): { deviceMemory?: number; connection?: { saveData?: boolean } } => (typeof navigator === "undefined" ? {} : (navigator as unknown as { deviceMemory?: number; connection?: { saveData?: boolean } }));

export function autoClassic(): boolean {
  try {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const n = nav();
    return (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) || n.connection?.saveData === true;
  } catch { return false; }
}
export function readClassic(): { classic: boolean; chosen: boolean } {
  try { const v = localStorage.getItem(KEY); if (v === "1" || v === "0") return { classic: v === "1", chosen: true }; } catch { /* storage blocked */ }
  return { classic: autoClassic(), chosen: false };
}
interface S { classic: boolean; chosen: boolean; set: (v: boolean) => void }
const init = readClassic();
const apply = (v: boolean) => { if (typeof document !== "undefined") document.documentElement.classList.toggle("classic", v); };
apply(init.classic);
export const useClassicMode = create<S>((set) => ({
  ...init,
  set: (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ } apply(v); set({ classic: v, chosen: true }); },
}));
