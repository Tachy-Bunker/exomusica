import { create } from "zustand";

interface ToastState {
  message: string | null;
  showToast: (message: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
