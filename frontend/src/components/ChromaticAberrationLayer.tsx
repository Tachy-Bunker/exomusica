import { useEffect, useRef } from "react";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

// Deliberately not a mirror of R_DIR — keeps the split asymmetric, matching the prototype.
const CA_R_DIR: [number, number] = [1.0, 0.32];
const CA_B_DIR: [number, number] = [-0.58, -0.82];

function rotVec(vx: number, vy: number, ang: number): [number, number] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [vx * c - vy * s, vx * s + vy * c];
}

interface CaBurst {
  start: number;
  dur: number;
  peak: number;
  angR: number;
  angB: number;
}

export function ChromaticAberrationLayer() {
  const offRRef = useRef<SVGFEOffsetElement>(null);
  const offBRef = useRef<SVGFEOffsetElement>(null);

  useEffect(() => {
    let rafId: number;
    let nextBurst = performance.now() + 5000 + Math.random() * 5000;
    let burst: CaBurst | null = null;
    let paused = document.hidden;

    function handleVisibility() {
      paused = document.hidden;
      if (!paused) rafId = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function tick(now: number) {
      if (paused) return;
      const { caInitial, caBurst, userCaEnabled } = useSiteEffectsStore.getState();
      if (!userCaEnabled) {
        offRRef.current?.setAttribute("dx", "0");
        offRRef.current?.setAttribute("dy", "0");
        offBRef.current?.setAttribute("dx", "0");
        offBRef.current?.setAttribute("dy", "0");
        rafId = requestAnimationFrame(tick);
        return;
      }
      const initialAmt = caInitial * 12; // was *2.6 — capped at a sub-pixel 2.6px even at max, genuinely invisible
      const burstAmt = caBurst * 22;
      if (!reduceMotion) {
        if (!burst && now >= nextBurst) {
          burst = {
            start: now,
            dur: 1500 + Math.random() * 900,
            peak: 0.55 + Math.random() * 0.55,
            angR: (Math.random() - 0.5) * 1.6,
            angB: (Math.random() - 0.5) * 1.6,
          };
          nextBurst = now + 5000 + Math.random() * 5000;
        }
      }

      let amt = initialAmt;
      let angR = 0;
      let angB = 0;
      if (burst) {
        const el = now - burst.start;
        if (el >= burst.dur) {
          burst = null;
        } else {
          const t = el / burst.dur;
          const env = Math.sin(Math.PI * t);
          const jitter = 0.85 + Math.random() * 0.3;
          amt = initialAmt + (burstAmt - initialAmt) * env * burst.peak * jitter;
          angR = burst.angR * env;
          angB = burst.angB * env;
        }
      }

      const [rx, ry] = rotVec(CA_R_DIR[0], CA_R_DIR[1], angR);
      const [bx, by] = rotVec(CA_B_DIR[0], CA_B_DIR[1], angB);
      offRRef.current?.setAttribute("dx", (rx * amt).toFixed(2));
      offRRef.current?.setAttribute("dy", (ry * amt).toFixed(2));
      offBRef.current?.setAttribute("dx", (bx * amt).toFixed(2));
      offBRef.current?.setAttribute("dy", (by * amt).toFixed(2));

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="caFilter" colorInterpolationFilters="sRGB" x="-15%" y="-15%" width="130%" height="130%">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rCh" />
          <feOffset ref={offRRef} in="rCh" dx="0" dy="0" result="rOff" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gCh" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bCh" />
          <feOffset ref={offBRef} in="bCh" dx="0" dy="0" result="bOff" />
          <feBlend in="rOff" in2="gCh" mode="screen" result="caRG" />
          <feBlend in="caRG" in2="bOff" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}
