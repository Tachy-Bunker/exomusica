import { useEffect, useRef } from "react";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

// A small tiled noise texture built once via SVG feTurbulence — far cheaper
// than a per-pixel fragment shader for something meant to read as "just
// enough grain to know it's there", and it tiles seamlessly.
const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
  <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>
  <rect width='100%' height='100%' filter='url(%23n)'/>
</svg>`;
const NOISE_URL = `url("data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}")`;

export function StaticSnowLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let lastStep = -1;
    let paused = document.hidden;

    function handleVisibility() {
      paused = document.hidden;
      if (!paused) rafId = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function tick(now: number) {
      if (paused) return;
      const { staticSpeed } = useSiteEffectsStore.getState();
      if (!reduceMotion) {
        const stepRate = 4 + staticSpeed * 40; // steps per second
        const step = Math.floor((now / 1000) * stepRate);
        if (step !== lastStep && ref.current) {
          lastStep = step;
          // Jump the tile to a pseudo-random offset each step — reads as
          // flicker without regenerating the underlying noise texture.
          const ox = (step * 37) % 120;
          const oy = (step * 71) % 120;
          ref.current.style.backgroundPosition = `${ox}px ${oy}px`;
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const staticAmt = useSiteEffectsStore((s) => s.staticAmt);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        backgroundImage: NOISE_URL,
        backgroundRepeat: "repeat",
        backgroundSize: "120px 120px",
        opacity: staticAmt * 0.55,
        mixBlendMode: "overlay",
      }}
    />
  );
}
