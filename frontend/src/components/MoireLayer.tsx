import { useEffect, useRef } from "react";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

const BASE_TILE_PX = 200;

function triangleWave(phase01: number): number {
  const p = phase01 % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

export function MoireLayer() {
  const baseRef = useRef<HTMLDivElement>(null);
  const dupeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let paused = document.hidden;

    function handleVisibility() {
      paused = document.hidden;
      if (!paused) rafId = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function tick(now: number) {
      if (paused) return;
      const base = baseRef.current;
      const dupe = dupeRef.current;
      if (base && dupe) {
        const s = useSiteEffectsStore.getState();
        const t = now / 1000;

        if (!s.userMoireEnabled) {
          base.style.opacity = "0";
          dupe.style.opacity = "0";
          rafId = requestAnimationFrame(tick);
          return;
        }

        const bgImage = s.moireImageUrl ? `url(${s.moireImageUrl})` : "none";
        const bgSize = `${BASE_TILE_PX * s.moireSize}px`;
        base.style.backgroundImage = bgImage;
        base.style.backgroundSize = bgSize;
        base.style.opacity = String(s.moireOpacity);
        dupe.style.backgroundImage = bgImage;
        dupe.style.backgroundSize = bgSize;
        dupe.style.opacity = String(s.moireOpacity);

        if (!reduceMotion) {
          const cyclePhase = t * s.moireOffsetSpeed;
          const wave = s.moireWaveform === "triangle" ? triangleWave(cyclePhase) : (Math.sin(cyclePhase * Math.PI * 2) + 1) / 2;
          const offset = s.moireOffsetMin + wave * (s.moireOffsetMax - s.moireOffsetMin);
          const rotation = (t * s.moireRotationSpeed * 360) % 360;
          // Only the duplicate moves — the base stays put, so the two
          // overlapping transparent layers interfere with each other as
          // the duplicate drifts and turns, which is the actual moiré.
          dupe.style.backgroundPosition = `${offset}px ${offset}px`;
          dupe.style.transform = `rotate(${rotation}deg)`;
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

  return (
    // Outer wrapper is exactly viewport-sized and clips its children —
    // this is what actually fixes the scrollbar/page-size bug: the inner
    // layers are deliberately oversized (200%) so rotation never reveals
    // empty corners, but without this clip that oversized box was
    // affecting layout/scroll regardless of position:fixed, because an
    // ancestor's CSS filter (the chromatic aberration wrapper) changes
    // fixed-position containment — overflow:hidden here neutralizes that
    // side effect entirely rather than depending on it not mattering.
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 9998, pointerEvents: "none" }}>
      <div ref={baseRef} style={{ position: "absolute", inset: "-50%", width: "200%", height: "200%", backgroundRepeat: "repeat", mixBlendMode: "overlay" }} />
      <div ref={dupeRef} style={{ position: "absolute", inset: "-50%", width: "200%", height: "200%", backgroundRepeat: "repeat", mixBlendMode: "overlay" }} />
    </div>
  );
}
