import { useRef } from "react";

/** A thumb stick on pointer events (touch, pen or mouse). Reports -1..1 on each axis, y up; sets the knob straight on the element, so it never re-renders. */
export function RoomStick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null), id = useRef<number | null>(null), rad = useRef(48);
  const at = (e: React.PointerEvent) => {
    const b = base.current!.getBoundingClientRect(); rad.current = b.width / 2;
    let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2); const L = Math.hypot(dx, dy), r = rad.current;
    if (L > r) { dx = (dx / L) * r; dy = (dy / L) * r; }
    knob.current!.style.transform = `translate(${dx}px,${dy}px)`;
    const x = dx / r, y = -dy / r, m = Math.hypot(x, y);
    if (m < 0.12) onChange(0, 0); else onChange(x, y);
  };
  const end = (e: React.PointerEvent) => { if (e.pointerId !== id.current) return; id.current = null; knob.current!.style.transform = "translate(0,0)"; onChange(0, 0); };
  return (
    <div ref={base} className="rm-stick" data-testid="room-stick" style={{ touchAction: "none" }}
      onPointerDown={(e) => { if (id.current != null) return; id.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ } e.preventDefault(); at(e); }}
      onPointerMove={(e) => { if (e.pointerId === id.current) at(e); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div ref={knob} className="rm-knob" />
    </div>
  );
}
