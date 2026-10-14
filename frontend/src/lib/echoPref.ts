import { create } from "zustand";
const KEY = "exomusica_echo";
const read = () => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };
/** Echo (rings from the playhead) is on unless the listener turned it off; classic mode and reduced motion override it. */
export const useEchoPref = create<{ on: boolean; set: (v: boolean) => void }>((set) => ({
  on: read(),
  set: (on) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage blocked */ } set({ on }); },
}));
