import { useEffect, useRef } from "react";
import { useAudioStore } from "../lib/audioStore";

const PRELOAD_SECONDS = 15;

export function TrackPreloader() {
  const nextUrl = useAudioStore((s) => s.queue[0]?.fileUrl ?? null);
  const elRef = useRef<HTMLAudioElement>(null);
  const loadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !nextUrl) return;
    if (loadedUrlRef.current === nextUrl) return; // already preloading (or preloaded) this exact track
    loadedUrlRef.current = nextUrl;

    function checkBuffered() {
      if (!el) return;
      try {
        if (el.buffered.length > 0 && el.buffered.end(0) >= PRELOAD_SECONDS) {
          el.removeEventListener("progress", checkBuffered);
          el.pause(); // stops further buffering once we have enough
        }
      } catch {
        // Buffering state is just a best-effort optimization - never let
        // a failure here surface anywhere.
      }
    }

    try {
      el.addEventListener("progress", checkBuffered);
      el.src = nextUrl;
      el.load();
    } catch (err) {
      console.error("Track preload failed (playback unaffected):", err);
    }

    return () => {
      el?.removeEventListener("progress", checkBuffered);
    };
  }, [nextUrl]);

  return <audio ref={elRef} preload="auto" muted style={{ display: "none" }} />;
}
