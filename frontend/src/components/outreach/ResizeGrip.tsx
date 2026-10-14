import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

const get = (k: string): number | null => { try { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } };
const put = (k: string, v: number | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(Math.round(v))); } catch { /* storage blocked: the height just won't be remembered */ } };

/**
 * A bar under a scrolling box that makes the box taller or shorter: drag it (mouse, touch or pen), or focus it and press the arrow keys.
 * The height is set straight on the element, never through React state, so dragging does not re-render a table of hundreds of rows. Remembered on this device; double-click or Home puts it back.
 */
export function ResizeGrip({ target, storeKey, min = 160, label = "Resize the list" }: { target: RefObject<HTMLElement | null>; storeKey: string; min?: number; label?: string }) {
  const drag = useRef<{ y: number; h: number } | null>(null);
  const max = () => Math.max(min, Math.floor(window.innerHeight * 0.95));
  const apply = (h: number | null) => {
    const el = target.current; if (!el) return;
    if (h === null) { el.style.height = ""; el.style.maxHeight = ""; return; }
    el.style.maxHeight = "none"; el.style.height = `${Math.min(max(), Math.max(min, h))}px`;
  };
  useEffect(() => { const h = get(storeKey); if (h) apply(h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = () => target.current?.offsetHeight ?? min;
  const down = (e: PointerEvent) => { drag.current = { y: e.clientY, h: current() }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); };
  const move = (e: PointerEvent) => { if (drag.current) apply(drag.current.h + e.clientY - drag.current.y); };
  const up = () => { if (drag.current) { drag.current = null; put(storeKey, current()); } };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); apply(current() + (e.key === "ArrowDown" ? 40 : -40)); put(storeKey, current()); }
    else if (e.key === "Home") { e.preventDefault(); apply(null); put(storeKey, null); }
  };
  return (
    <div className="ox-grip" role="separator" aria-orientation="horizontal" aria-label={`${label} (drag, or arrow keys; Home resets)`} tabIndex={0} data-testid="ox-grip"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} onDoubleClick={() => { apply(null); put(storeKey, null); }} title="Drag to resize. Double-click to reset.">
      <span aria-hidden="true" />
    </div>
  );
}
