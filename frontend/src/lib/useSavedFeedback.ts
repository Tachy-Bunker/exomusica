import { useRef, useState } from "react";

export function useSavedFeedback(durationMs = 2000) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash() {
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), durationMs);
  }

  return { saved, flash };
}
