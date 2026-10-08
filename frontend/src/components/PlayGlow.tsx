import { useEffect, useRef, useState, type ReactNode } from "react";
import { registerGlow } from "../lib/fireflies";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

const FLIES = [1, 2, 3, 4];

/**
 * Wraps a Play button the visitor should be drawn to. While `active` (always, or only while the pointer is over `hostSelector`'s element)
 * it breathes with a soft glow in the admin-chosen colour and a few fireflies wander round it on Perlin noise.
 * With no colour chosen, or not active, it renders the button exactly as it was. With reduced motion on, the flies still show (this is the one thing the visitor is meant to find) but drift at a quarter of the speed and the button does not pulse.
 */
export function PlayGlow({ children, when = "always", hostSelector, active = true }: { children: ReactNode; when?: "always" | "hover"; hostSelector?: string; active?: boolean }) {
  const color = useSiteEffectsStore((s) => s.playHighlightColor);
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (when !== "hover" || !color) return;
    const host = (hostSelector ? ref.current?.closest(hostSelector) : ref.current?.parentElement) as HTMLElement | null | undefined;
    if (!host) return;
    const on = () => setHover(true), off = () => setHover(false);
    host.addEventListener("pointerenter", on);
    host.addEventListener("pointerleave", off);
    host.addEventListener("focusin", on);
    host.addEventListener("focusout", off);
    return () => { host.removeEventListener("pointerenter", on); host.removeEventListener("pointerleave", off); host.removeEventListener("focusin", on); host.removeEventListener("focusout", off); setHover(false); };
  }, [when, hostSelector, color]);

  const lit = !!color && active && (when === "always" || hover);
  useEffect(() => {
    if (!lit || !ref.current) return;
    const host = ref.current;
    const flies = [...host.querySelectorAll<HTMLElement>(".play-fly")].map((el, i) => ({ el, seed: FLIES[i] + (host.dataset.seed ? Number(host.dataset.seed) : 0) }));
    return registerGlow({ host, flies, calm: reduce });
  }, [lit, reduce]);

  return (
    <span ref={ref} className={`play-hl${lit ? " play-hl-on" : ""}`} style={lit ? { ["--hl" as string]: color } : undefined} data-seed={Math.floor(Math.random() * 50)}>
      {children}
      {lit && FLIES.map((n) => <i key={n} className="play-fly" aria-hidden="true" />)}
    </span>
  );
}
