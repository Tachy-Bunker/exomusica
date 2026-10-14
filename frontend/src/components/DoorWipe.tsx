import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClassicMode } from "../lib/classicMode";
import { levelOf } from "../lib/access";
import { branchSlugOf, doorTarget, readyToOpen, sectionOf } from "../lib/doorRoute";
import { inflight } from "../lib/loadWatch";
import { themeOf } from "../lib/headerTheme";
import { useDoorStyle } from "../lib/doorStyle";
import { setDoorReplay } from "../lib/doorReplay";
import { neon } from "../lib/legibleColor";
import { doorTexture } from "../lib/doorTexture";
import { BLADES, blade, cornerMask, frameOctagon, isPortrait } from "../lib/doorShape";

type Phase = "idle" | "closing" | "closed" | "opening";
/** The site's main colour right now (it follows the era and the chosen skin). */
const sitePrimary = (): string => { try { const v = getComputedStyle(document.documentElement).getPropertyValue("--accent-forum").trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : "#e2703f"; } catch { return "#e2703f"; } };
const R = 300;
const pt = (deg: number, r = R): string => `${(Math.cos((deg * Math.PI) / 180) * r).toFixed(1)},${(Math.sin((deg * Math.PI) / 180) * r).toFixed(1)}`;
/** Six wedges around the middle. Each one slides in from outside the screen along its own direction. */
const PANELS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = i * 60, mid = a + 30;
  return {
    i,
    tri: `0,0 ${pt(a)} ${pt(a + 60)}`,
    win: `${pt(mid, 34)} ${pt(a + 8, 150)} ${pt(a + 52, 150)}`,
    tx: Math.round(Math.cos((mid * Math.PI) / 180) * 520),
    ty: Math.round(Math.sin((mid * Math.PI) / 180) * 520),
  };
});
const SPIKES = Array.from({ length: BLADES }, (_, i) => blade(i));
const OCT = frameOctagon(), MASK = cornerMask();
/** Faint spiral marks in the wall behind the spikes. */
const SWIRL = Array.from({ length: 28 }, (_, k) => { const t = k / 27, a = t * Math.PI * 4.2, r = 0.5 + t * 4; return `${k ? "L" : "M"}${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`; }).join(" ");
const SWIRLS: [number, number, number][] = [[-62, -30, 1], [60, -34, 0.8], [-66, 28, 0.9], [64, 30, 1.1], [-30, -42, 0.6], [34, 42, 0.7], [0, -44, 0.5], [-4, 44, 0.6]];
const HEX = [0, 1, 2, 3, 4, 5].map((i) => pt(i * 60, 26)).join(" ");

/** A hexagonal six-panel door between sections. It closes over the page, waits behind it until the next page has finished loading, then opens. One fixed SVG, CSS animations only; classic mode and reduced motion never show it. */
export function DoorWipe() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const classic = useClassicMode((s) => s.classic);
  const style = useDoorStyle((s) => s.style);
  const [portrait, setPortrait] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [color, setColor] = useState<string | null>(null);
  const [target, setTarget] = useState(pathname);
  const phaseRef = useRef<Phase>("idle");
  const path = useRef(pathname);
  const want = useRef<{ to: string; a: Element } | null>(null); // the link the door is covering: clicked again for real once the door is shut
  const bypass = useRef(false);
  const closedAt = useRef(0);
  const set = (p: Phase) => { if (p === "closing") setPortrait(isPortrait(window.innerWidth, window.innerHeight)); phaseRef.current = p; setPhase(p); };
  const off = (): boolean => classic || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  path.current = pathname;

  const aim = (to: string) => {
    setTarget(to);
    const slug = branchSlugOf(to);
    setColor(null);
    if (slug) void themeOf(slug).then((t) => { if (t && phaseRef.current !== "idle") setColor(t.color); });
  };

  // clicks on links between sections: play the door first, then go
  useEffect(() => {
    if (classic) return;
    const onClick = (e: MouseEvent) => {
      if (bypass.current) return;
      if (phaseRef.current !== "idle" || off()) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const to = doorTarget(
        { button: e.button, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, defaultPrevented: e.defaultPrevented },
        { href: a.getAttribute("href"), target: a.getAttribute("target"), download: a.hasAttribute("download"), origin: location.origin, noDoor: a.hasAttribute("data-no-door"), always: a.hasAttribute("data-door-always") },
        path.current,
      );
      if (!to) return;
      e.preventDefault(); e.stopPropagation();
      want.current = { to, a }; aim(to); set("closing");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classic]);

  // navigation that did not come from a click: close at once over the new page, then run the same wait
  const last = useRef(sectionOf(pathname));
  useEffect(() => {
    const s = sectionOf(pathname);
    if (s === last.current) return;
    last.current = s;
    if (phaseRef.current === "idle" && !off()) { want.current = null; aim(pathname); set("closing"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // closing finished -> go, then wait behind the door
  const onEnd = () => {
    if (phaseRef.current === "closing") {
      closedAt.current = performance.now();
      set("closed");
      if (want.current) {
        const w = want.current; want.current = null;
        // run the link's own handlers and its navigation now, exactly as a click would have; if the link is gone, just go
        if (w.a.isConnected) { bypass.current = true; setDoorReplay(true); try { w.a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, view: window })); } finally { bypass.current = false; setDoorReplay(false); } }
        else navigate(w.to);
      }
    } else if (phaseRef.current === "opening") { set("idle"); setColor(null); }
  };

  useEffect(() => {
    if (phase !== "closed") return;
    let quiet = 0, stop = false;
    const t0 = performance.now();
    const tick = () => {
      if (stop) return;
      const now = performance.now();
      const busy = inflight() > 0 || !!document.querySelector(".fog-load, [aria-busy='true']");
      quiet = busy ? 0 : quiet + 80;
      const onTarget = want.current === null;
      if (readyToOpen({ onTarget, inflight: inflight(), fog: busy, quietMs: quiet, closedMs: now - closedAt.current }) || now - t0 > 6000) { set("opening"); return; }
      setTimeout(tick, 80);
    };
    const id = setTimeout(tick, 80);
    return () => { stop = true; clearTimeout(id); };
  }, [phase]);

  if (phase === "idle" || classic) return null;
  const c = neon(color ?? sitePrimary());
  if (style === "stronghold") {
    const tex = doorTexture();
    return (
      <div className="door-wipe" data-style="stronghold" data-door={levelOf(target)} data-phase={phase} data-portrait={portrait ? "1" : "0"} data-testid="door-wipe" aria-hidden="true" style={{ ["--door" as string]: c }}>
        <svg viewBox={portrait ? "-50 -80 100 160" : "-80 -50 160 100"} preserveAspectRatio="none" focusable="false">
          <defs>
            {tex && <pattern id="sh-moss" width="26" height="26" patternUnits="userSpaceOnUse"><image href={tex} width="26" height="26" /></pattern>}
            <pattern id="sh-scan" width=".5" height="100" patternUnits="userSpaceOnUse"><rect width=".22" height="100" fill="#000" /></pattern>
            <radialGradient id="sh-vig" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(95 60)"><stop offset=".45" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".7" /></radialGradient>
          </defs>
          <g transform={portrait ? "rotate(90)" : undefined}>
            <g className="sh-back">
              <polygon points={OCT} fill={tex ? "url(#sh-moss)" : "#08100e"} />
              <polygon points={OCT} className="sh-tint" />
              <polygon points={OCT} fill="url(#sh-scan)" className="sh-scanlines" />
              <polygon points={OCT} fill="url(#sh-vig)" />
              {SWIRLS.map((w, i) => <path key={i} d={SWIRL} className="sh-swirl" transform={`translate(${w[0]} ${w[1]}) scale(${w[2]})`} />)}
            </g>
            {SPIKES.map((b, i) => (
              <g key={i} className="sh-b" style={{ ["--tx" as string]: `${b.ox}px`, ["--ty" as string]: `${b.oy}px`, ["--rot" as string]: `${b.rot}deg`, ["--i" as string]: i }} onAnimationEnd={i === BLADES - 1 ? onEnd : undefined}>
                <path className="sh-blade" d={b.d} />
                <path className="sh-ridge" d={b.rib} />
                <path className="sh-rib" d={b.rib} />
              </g>
            ))}
            <g className="sh-over">
              <polygon points={OCT} fill="url(#sh-scan)" className="sh-scanlines sh-scan-top" />
              <circle className="sh-eye" r="3.2" />
            </g>
            <g className="sh-frame">
              <path className="sh-mask" d={MASK} fillRule="evenodd" />
              <polygon className="sh-glow-wide" points={OCT} />
              <polygon className="sh-oct" points={OCT} />
              <polygon className="sh-core" points={OCT} />
            </g>
          </g>
        </svg>
      </div>
    );
  }
  return (
    <div className="door-wipe" data-door={levelOf(target)} data-phase={phase} data-testid="door-wipe" aria-hidden="true" style={{ ["--door" as string]: c }}>
      <svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" focusable="false">
        {PANELS.map((p) => (
          <g key={p.i} className="dw-p" style={{ ["--tx" as string]: `${p.tx}px`, ["--ty" as string]: `${p.ty}px` }} onAnimationEnd={p.i === 0 ? onEnd : undefined}>
            <polygon className="dw-tri" points={p.tri} />
            <polygon className="dw-win" points={p.win} />
          </g>
        ))}
        <polygon className="dw-hex" points={HEX} />
      </svg>
    </div>
  );
}
