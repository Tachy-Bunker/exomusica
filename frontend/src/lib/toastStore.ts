import { create } from "zustand";

export interface ToastAction { label: string; run: () => void }
interface ToastState {
  message: string | null;
  action: ToastAction | null;
  showToast: (message: string, action?: ToastAction) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  action: null,
  showToast: (message, action) => set({ message, action: action ?? null }),
  clear: () => set({ message: null, action: null }),
}));
