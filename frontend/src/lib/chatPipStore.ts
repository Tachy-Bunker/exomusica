import { create } from "zustand";

interface ChatPipState {
  pipWindow: Window | null;
  setPipWindow: (win: Window | null) => void;
}

export const useChatPipStore = create<ChatPipState>((set) => ({
  pipWindow: null,
  setPipWindow: (win) => set({ pipWindow: win }),
}));

/** Opens the single always-on-top pop-out chat window (Document
 *  Picture-in-Picture — Chrome/Edge only; other browsers fall back to a
 *  regular, non-always-on-top popup, since no website can force real
 *  window-stacking behavior any other way). If one is already open, opens
 *  a second, ordinary popup instead — the browser only ever allows one
 *  real PiP window per tab, a hard platform limit, not a choice here. */
export async function openPopoutChat(initialSlug?: string | null, initialName?: string | null): Promise<void> {
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (opts: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
  const { pipWindow } = useChatPipStore.getState();

  if (dpip && !pipWindow) {
    const pip = await dpip.requestWindow({ width: 340, height: 480 });
    [...document.styleSheets].forEach((sheet) => {
      if (!sheet.href) return; // inline <style> tags with no href have nothing to link
      const link = pip.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      pip.document.head.appendChild(link);
    });
    pip.document.body.style.margin = "0";
    pip.document.body.style.height = "100vh";
    pip.addEventListener("pagehide", () => useChatPipStore.getState().setPipWindow(null));
    useChatPipStore.getState().setPipWindow(pip);
    return;
  }

  const params = new URLSearchParams();
  if (initialSlug) params.set("slug", initialSlug);
  if (initialName) params.set("name", initialName);
  window.open(`/chat-window?${params}`, "_blank", "popup=1,width=340,height=520");
}
