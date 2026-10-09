import { useEffect, useState } from "react";
/** True while the window is at most `px` wide (follows resizing). Used where a control moves to a different place on a phone. */
export function useNarrow(px: number): boolean {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setN(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return n;
}
