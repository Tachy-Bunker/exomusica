import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useClassicMode } from "../lib/classicMode";

const section = (p: string) => p.split("/")[1] ?? "";

/** A short wipe when you move between sections (not between pages of one section). One fixed element, one CSS animation, removed when it ends; reduced-motion and classic mode never show it. */
export function DoorWipe() {
  const { pathname } = useLocation();
  const classic = useClassicMode((s) => s.classic);
  const last = useRef(section(pathname));
  const [n, setN] = useState(0);
  useEffect(() => {
    const s = section(pathname);
    if (s !== last.current) { last.current = s; if (!classic) setN((x) => x + 1); }
  }, [pathname, classic]);
  if (n === 0 || classic) return null;
  return <div key={n} className="door-wipe" aria-hidden="true" data-testid="door-wipe" onAnimationEnd={() => setN(0)} />;
}
