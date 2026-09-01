import { useEffect, useRef, useState } from "react";
import { usePresenceStore } from "../lib/presenceStore";

interface Orb {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  el: HTMLDivElement;
}

const SIZE = 34; // container box, px
const ORB_RADIUS = 4;
const REPEL_RADIUS = 26;
const REPEL_STRENGTH = 420;
const SPRING = 10;
const DAMPING = 6;

// Deterministic-looking but organic scatter — procedurally placed per
// render, not a fixed lookup table, so the cluster's shape isn't identical
// every time the count is the same.
function scatterPositions(n: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const radius = n === 1 ? 0 : 8 + Math.random() * 6;
    positions.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return positions;
}

export function OnlineOrbs() {
  const onlineCount = usePresenceStore((s) => s.onlineCount);
  const viewersByChannel = usePresenceStore((s) => s.viewersByChannel);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbsRef = useRef<Orb[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const displayCount = Math.min(onlineCount, 9);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || displayCount === 0) return;

    container.innerHTML = "";
    const positions = scatterPositions(displayCount);
    orbsRef.current = positions.map((pos) => {
      const el = document.createElement("div");
      el.className = "online-orb";
      el.style.left = `${pos.x - ORB_RADIUS}px`;
      el.style.top = `${pos.y - ORB_RADIUS}px`;
      container.appendChild(el);
      return { baseX: pos.x, baseY: pos.y, x: pos.x, y: pos.y, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, el };
    });

    const start = performance.now();
    function tick(now: number) {
      const t = (now - start) / 1000;
      for (const orb of orbsRef.current) {
        const idleX = orb.baseX + Math.sin(t * 1.3 + orb.phase) * 3;
        const idleY = orb.baseY + Math.cos(t * 1.1 + orb.phase) * 3;

        let fx = (idleX - orb.x) * SPRING;
        let fy = (idleY - orb.y) * SPRING;

        if (mouseRef.current) {
          const dx = orb.x - mouseRef.current.x;
          const dy = orb.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < REPEL_RADIUS) {
            const push = (REPEL_RADIUS - dist) * REPEL_STRENGTH;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }

        orb.vx = (orb.vx + fx * 0.016) * (1 - DAMPING * 0.016);
        orb.vy = (orb.vy + fy * 0.016) * (1 - DAMPING * 0.016);
        orb.x += orb.vx * 0.016;
        orb.y += orb.vy * 0.016;

        orb.el.style.transform = `translate(${orb.x - orb.baseX}px, ${orb.y - orb.baseY}px)`;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [displayCount]);

  if (onlineCount === 0) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <div
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = containerRef.current!.getBoundingClientRect();
          mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onMouseLeave={() => (mouseRef.current = null)}
        onClick={() => setOpen((v) => !v)}
        style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0, cursor: "pointer" }}
      />
      <span onClick={() => setOpen((v) => !v)} style={{ fontSize: "0.8rem", color: "var(--text-dim)", cursor: "pointer" }}>
        {onlineCount} online
      </span>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.4rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.5rem",
            minWidth: 200,
            zIndex: 30,
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>{onlineCount} online</div>
          {viewersByChannel.size === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: 0 }}>Nobody's in a specific topic right now.</p>
          ) : (
            [...viewersByChannel.entries()].map(([channelSlug, usernames]) => (
              <div key={channelSlug} style={{ fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                <span className="mono" style={{ color: "var(--accent-audio)" }}>
                  {channelSlug}
                </span>
                : {usernames.join(", ")}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
