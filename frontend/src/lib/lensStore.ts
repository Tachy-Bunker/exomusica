import { create } from "zustand";
/** The Trace lens: when on, the marks other people left on a place show. Off by default, remembered per browser. */
const KEY = "exomusica_lens";
const read = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
interface LensState { on: boolean; set: (v: boolean) => void; toggle: () => void }
export const useLensStore = create<LensState>((set, get) => ({
  on: read(),
  set: (on) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage blocked */ } set({ on }); },
  toggle: () => get().set(!get().on),
}));
