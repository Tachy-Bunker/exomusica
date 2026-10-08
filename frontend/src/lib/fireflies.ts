// Drives every visible Play glow from ONE animation loop, so the cost is the same whether one button glows or six.
// The loop only runs while something is registered, the tab is visible, and the visitor has not asked for reduced motion.
import { perlin1 } from "./noise";

interface Fly { el: HTMLElement; seed: number }
interface Glow { flies: Fly[]; host: HTMLElement }
const glows = new Set<Glow>();
let raf = 0;
let last = 0;
const SPEED = 0.22; // noise units per second: slow, drifting
const FRAME_MS = 1000 / 30;

/** Where fly #seed is at time t, as fractions of the button's half-size (-1..1 around it) and a brightness 0..1. Pure: tested. */
export function flyPosition(seed: number, t: number): { x: number; y: number; glow: number } {
  const x = perlin1(t * SPEED + seed * 17.3);
  const y = perlin1(t * SPEED + seed * 17.3 + 101.7);
  const glow = 0.45 + 0.55 * (0.5 + 0.5 * perlin1(t * SPEED * 2.2 + seed * 5.1 + 40));
  return { x, y, glow };
}

function frame(now: number) {
  raf = 0;
  if (glows.size === 0 || document.hidden) return;
  if (now - last >= FRAME_MS) {
    last = now;
    const t = now / 1000;
    for (const g of glows) {
      const r = g.host.offsetWidth / 2 + 7; // the flies orbit just outside the button's edge
      const rh = g.host.offsetHeight / 2 + 7;
      for (const f of g.flies) {
        const p = flyPosition(f.seed, t);
        f.el.style.transform = `translate(${(p.x * r).toFixed(1)}px, ${(p.y * rh).toFixed(1)}px)`;
        f.el.style.opacity = p.glow.toFixed(2);
      }
    }
  }
  raf = requestAnimationFrame(frame);
}
const wake = () => { if (!raf && glows.size && !document.hidden) raf = requestAnimationFrame(frame); };
if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);

export function registerGlow(g: Glow): () => void {
  glows.add(g);
  wake();
  return () => { glows.delete(g); if (glows.size === 0 && raf) { cancelAnimationFrame(raf); raf = 0; } };
}
