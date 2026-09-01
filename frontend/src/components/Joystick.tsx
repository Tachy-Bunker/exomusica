import { useRef, useState } from "react";

const BASE_RADIUS = 44;
const KNOB_RADIUS = 20;

export function Joystick({ onMove, onRelease }: { onMove: (dx: number, dy: number) => void; onRelease: () => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);

  function updateFromTouch(touch: React.Touch) {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > BASE_RADIUS) {
      dx = (dx / dist) * BASE_RADIUS;
      dy = (dy / dist) * BASE_RADIUS;
    }
    setKnobOffset({ x: dx, y: dy });
    // Normalized -1..1 per axis, proportional to how far the stick is pushed.
    onMove(dx / BASE_RADIUS, dy / BASE_RADIUS);
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault(); // this is the "don't scroll the page" guard
    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;
    updateFromTouch(touch);
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchId.current);
    if (touch) updateFromTouch(touch);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    const stillDown = Array.from(e.touches).some((t) => t.identifier === activeTouchId.current);
    if (stillDown) return;
    activeTouchId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onRelease(); // camera keeps coasting from here via the existing inertia/friction system
  }

  return (
    <div
      ref={baseRef}
      className="space-joystick-base"
      style={{ touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="space-joystick-knob"
        style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`, width: KNOB_RADIUS * 2, height: KNOB_RADIUS * 2 }}
      />
    </div>
  );
}
