import { useEffect } from "react";
import { useAudioStore } from "./audioStore";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function useGlobalPlayerShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const store = useAudioStore.getState();
      if (!store.currentTrack) return;

      if (e.key === " ") {
        e.preventDefault();
        store.toggle();
      } else if (e.key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        store.playPrevious();
      } else if (e.key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        store.playNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        store.seekBy(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        store.seekBy(5);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
