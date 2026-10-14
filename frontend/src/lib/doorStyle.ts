import { create } from "zustand";
/** Which door plays between sections: the stronghold door (default) or the original hexagon, kept as a safe fallback. */
export type DoorStyle = "stronghold" | "hex";
const KEY = "exomusica_door";
export const asDoorStyle = (v: unknown): DoorStyle => (v === "hex" ? "hex" : "stronghold");
const read = (): DoorStyle => { try { return asDoorStyle(localStorage.getItem(KEY)); } catch { return "stronghold"; } };
export const useDoorStyle = create<{ style: DoorStyle; set: (s: DoorStyle) => void }>((set) => ({
  style: read(),
  set: (style) => { try { localStorage.setItem(KEY, style); } catch { /* storage blocked */ } set({ style }); },
}));
