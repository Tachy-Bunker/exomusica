import { create } from "zustand";

const KEY = "exomusica_notif_hidden";

interface WidgetVisibilityState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const useNotificationWidgetVisibility = create<WidgetVisibilityState>((set) => ({
  hidden: localStorage.getItem(KEY) === "1",
  setHidden: (hidden) => {
    if (hidden) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    set({ hidden });
  },
}));
