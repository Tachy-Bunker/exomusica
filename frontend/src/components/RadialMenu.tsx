import { useEffect } from "react";
import { fitCentre, radialSlots } from "../lib/gesture";

export interface RadialItem { id: string; label: string; glyph: React.ReactNode; danger?: boolean; hint?: string }
export const RADIAL_R = 84;

/** A fan of round buttons around the spot a message was held. Slide onto one and let go, or let go and tap one; tap anywhere else to close. */
export function RadialMenu({ x, y, items, sel, onPick, onClose }: { x: number; y: number; items: RadialItem[]; sel: number; onPick: (i: RadialItem) => void; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const c = fitCentre(x, y, RADIAL_R + 34, window.innerWidth, window.innerHeight);
  const slots = radialSlots(items.length, RADIAL_R);
  return (
    <div className="radial" role="menu" aria-label="Message actions" data-testid="radial" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <span className="radial-dot" style={{ left: c.x, top: c.y }} aria-hidden="true" />
      {items.map((it, i) => (
        <button key={it.id} type="button" role="menuitem" className={`radial-btn${sel === i ? " on" : ""}${it.danger ? " danger" : ""}`} style={{ left: c.x + slots[i].x, top: c.y + slots[i].y, animationDelay: `${i * 22}ms` }}
          onClick={() => onPick(it)} aria-label={it.label} data-testid={`radial-${it.id}`}>
          <span aria-hidden="true">{it.glyph}</span><small>{it.label}{it.hint && <kbd className="radial-key"> {it.hint}</kbd>}</small>
        </button>
      ))}
    </div>
  );
}
