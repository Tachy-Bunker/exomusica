import { useEffect, useState } from "react";

const GLITCH_GLYPHS = "▓▒░#%&$@*+=~^";

/** Returns a version of `text` with 1-2 random characters occasionally
 *  swapped for a glitch glyph, reverting after a short beat. Re-rolls on
 *  an interval; disabled entirely when `text` is empty. */
export function useGlitchText(text: string, intervalMs = 2600): string {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    setDisplay(text);
    if (!text) return;
    let glitchTimeout: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      const letterIndices = [...text].map((ch, i) => (ch === " " ? -1 : i)).filter((i) => i >= 0);
      if (letterIndices.length === 0) return;

      const glitchCount = Math.random() < 0.35 ? 2 : 1;
      const chosen = new Set<number>();
      for (let n = 0; n < glitchCount && chosen.size < letterIndices.length; n++) {
        chosen.add(letterIndices[Math.floor(Math.random() * letterIndices.length)]);
      }

      const glitched = [...text]
        .map((ch, i) => (chosen.has(i) ? GLITCH_GLYPHS[Math.floor(Math.random() * GLITCH_GLYPHS.length)] : ch))
        .join("");
      setDisplay(glitched);

      glitchTimeout = setTimeout(() => setDisplay(text), 120);
    }, intervalMs);

    return () => {
      clearInterval(interval);
      if (glitchTimeout) clearTimeout(glitchTimeout);
    };
  }, [text, intervalMs]);

  return display;
}
