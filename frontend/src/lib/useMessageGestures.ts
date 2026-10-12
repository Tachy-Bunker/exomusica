import { useCallback, useEffect, useRef } from "react";
import { stillHolding, swipeIntent } from "./gesture";
import { buzz } from "./haptics";

interface Opts {
  enabled: boolean;
  /** The finger stayed down: open the fan at this point of the screen. */
  onHold: (x: number, y: number) => void;
  /** While the fan is open and the finger is still down: how far it has moved from where it started. */
  onHoldMove: (dx: number, dy: number) => void;
  /** The finger lifted after a hold. */
  onHoldEnd: (dx: number, dy: number) => void;
  /** A clear swipe to the right. */
  onSwipeRight: () => void;
}
export const HOLD_MS = 450;

/** Touch gestures on one message: hold for the fan, swipe right to pocket what it links to. Mouse and pen are left alone (they have the ⋮ menu). Props to spread on the row. */
export function useMessageGestures(o: Opts) {
  const row = useRef<HTMLDivElement>(null);
  const st = useRef({ id: -1, x: 0, y: 0, held: false, swiping: false, timer: 0 });
  const opts = useRef(o); opts.current = o;
  const reset = useCallback(() => {
    const s = st.current; window.clearTimeout(s.timer); s.id = -1; s.held = false; s.swiping = false;
    const el = row.current; if (el) { el.style.transition = "transform .18s ease"; el.style.transform = ""; el.style.setProperty("--sw", "0"); }
  }, []);
  useEffect(() => () => window.clearTimeout(st.current.timer), []);

  return {
    ref: row,
    onPointerDown(e: React.PointerEvent) {
      if (!opts.current.enabled || e.pointerType !== "touch" || st.current.id !== -1) return;
      if ((e.target as Element).closest("a,button,input,textarea,audio,video,.voice-strip,pre,code")) return; // those keep their own touches
      const s = st.current; s.id = e.pointerId; s.x = e.clientX; s.y = e.clientY; s.held = false; s.swiping = false;
      const el = row.current; if (el) el.style.transition = "none";
      s.timer = window.setTimeout(() => { s.held = true; buzz("snap"); opts.current.onHold(s.x, s.y); }, HOLD_MS);
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current; if (e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (s.held) { opts.current.onHoldMove(dx, dy); return; }
      if (!stillHolding(dx, dy, 12)) window.clearTimeout(s.timer);
      if (!s.swiping && dx > 14 && dx > Math.abs(dy) * 2) s.swiping = true;
      if (s.swiping) {
        const el = row.current; const d = Math.max(0, Math.min(dx, 110));
        if (el) { el.style.transform = `translateX(${d}px)`; el.style.setProperty("--sw", String(Math.min(1, d / 64))); }
      }
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current; if (e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (s.held) opts.current.onHoldEnd(dx, dy);
      else if (s.swiping && swipeIntent(dx, dy) === "right") { buzz("tick"); opts.current.onSwipeRight(); }
      reset();
    },
    onPointerCancel(e: React.PointerEvent) { if (e.pointerId === st.current.id) reset(); },
    onContextMenu(e: React.MouseEvent) { if (st.current.held) e.preventDefault(); },
  };
}
