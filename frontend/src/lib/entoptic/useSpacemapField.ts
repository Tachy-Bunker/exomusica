import { useEffect, useRef } from "react";
import { FieldRenderer } from "./fieldRenderer";
import { OverlaySnowRenderer } from "./overlaySnow";
import { WardenSystem } from "./wardenSystem";

// Matches the prototype's <div class="hud"> default slider values exactly.
export const FX_DEFAULTS = {
  debrisCount: 320,
  wardenCount: 5,
  split: 0.4,
  chaos: 0.5,
  drift: 0.38,
  lurk: 0.45,
  bgBright: 0.5,
  bgSat: 0.5,
  bgContrast: 0.5,
  staticAmt: 0.18,
  staticSpeed: 0.55,
  vignette: 0.5,
  caInitial: 0.15,
  caBurst: 0.6,
  wardenHue: 0,
  trailAmt: 0.4,
  wardenReveal: 0.65,
  wardenHuskBright: 0.3,
  wardenOrbBright: 0.3,
  glowHue: 280,
  glowSat: 0.6,
  glowBright: 0.45,
};

export type FxSettings = typeof FX_DEFAULTS;

/** Shared mutable pointer ref, updated once per frame by whoever owns the
 *  crosshair — step 3 of the migration wires the spacemap reticle into this
 *  instead of the field running its own lerp. Exported so that component
 *  can reach in without needing this hook to know about it. */
export const pointerRef = { x: 0, y: 0 };

export function useSpacemapField(settings: FxSettings = FX_DEFAULTS) {
  const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
  const wardenCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const fieldCanvas = fieldCanvasRef.current;
    const wardenCanvas = wardenCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!fieldCanvas || !wardenCanvas || !overlayCanvas || !container) return;

    const seed = (Math.random() * 0xffffffff) >>> 0;
    const field = new FieldRenderer(fieldCanvas);
    const overlay = new OverlaySnowRenderer(overlayCanvas);
    const wardens = new WardenSystem(wardenCanvas, seed);
    wardens.setWardens(settingsRef.current.wardenCount);

    function resize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      field.resize(w, h);
      overlay.resize(w, h);
      wardens.resize(w, h);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let rafId: number;
    let last = performance.now();
    let paused = document.hidden;

    function handleVisibility() {
      paused = document.hidden;
      if (!paused) {
        last = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    function frame(now: number) {
      if (paused) return;
      const dt = Math.min(70, now - last);
      last = now;
      const s = settingsRef.current;

      wardens.tick(dt, 1, s.drift);
      wardens.updateTrails(now, s.trailAmt);

      const fieldSources = wardens.getFieldSources(now);
      const fieldFlyers = wardens.getFieldFlyers();

      field.render({
        pointerX: pointerRef.x,
        pointerY: pointerRef.y,
        time: now,
        seed,
        split: s.split,
        chaos: s.chaos,
        lurk: s.lurk,
        bgBright: s.bgBright * 2,
        bgSat: s.bgSat * 2,
        bgContrast: s.bgContrast * 2,
        sources: fieldSources,
        ripples: [],
        flyers: fieldFlyers,
      });

      overlay.render({ time: now, staticAmt: s.staticAmt, staticSpeed: s.staticSpeed });

      const containerW = container!.clientWidth || 1;
      const containerH = container!.clientHeight || 1;
      wardens.render({
        time: now,
        pointerNormX: (pointerRef.x * 2) / containerW,
        pointerNormY: (pointerRef.y * 2) / containerH,
        hueShift: s.wardenHue,
        revealAmt: s.wardenReveal,
        huskB: s.wardenHuskBright,
        orbB: s.wardenOrbBright,
        glowHue: s.glowHue,
        glowSat: s.glowSat * 100,
        glowB: s.glowBright,
      });

      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      field.dispose();
      overlay.dispose();
      wardens.dispose();
    };
  }, []);

  return { containerRef, fieldCanvasRef, wardenCanvasRef, overlayCanvasRef };
}
