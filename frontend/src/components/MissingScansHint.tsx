import { useEffect, useState } from "react";
import { hashStr } from "../lib/probeCore";
import { scannedIds } from "../lib/scanLog";
import { keysOf, missingHint } from "../lib/fieldLog";
import { useClassicMode } from "../lib/classicMode";

/** Under a page's text: how many authored scan points are still unfound. Counted once after render, never while scrolling, and never says where. */
export function MissingScansHint({ ready }: { ready: unknown }) {
  const [n, setN] = useState(0);
  const classic = useClassicMode((s) => s.classic);
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      const have = keysOf(scannedIds());
      let miss = 0;
      document.querySelectorAll<HTMLElement>(".probe-point").forEach((el) => { if (!have.has(`point:${hashStr(location.pathname + "|" + (el.textContent ?? "").trim().toLowerCase())}`)) miss++; });
      setN(miss);
    }, 400);
    return () => window.clearTimeout(t);
  }, [ready]);
  const text = missingHint(n);
  return text && !classic ? <p className="home-dim missing-scans" data-testid="missing-scans">{text}</p> : null;
}
