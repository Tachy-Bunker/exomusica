import { create } from "zustand";
interface TerminalState { open: boolean; prefill: string; show: (prefill?: string) => void; hide: () => void; toggle: () => void }
export const useTerminalStore = create<TerminalState>((set, get) => ({
  open: false,
  prefill: "",
  show: (prefill = "") => set({ open: true, prefill }),
  hide: () => set({ open: false }),
  toggle: () => set({ open: !get().open, prefill: "" }),
}));
