import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Branch } from "../lib/types";

interface MapNode {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  isAnchor: boolean;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  wanderSeed: number;
}

const WORLD_SPREAD = 1400; // how far anchors can scatter from center
const REPEL_RADIUS = 90;
const REPEL_STRENGTH = 2400;
const SPRING = 3.5;
const DAMPING = 4.5;
const CAMERA_ACCEL = 1800;
const CAMERA_FRICTION = 5;
const CAMERA_MAX_SPEED = 900;

function buildNodes(branches: Branch[]): MapNode[] {
  const centralOrbiters = branches.filter((b) => !b.parentId && !b.isAnchor);
  const anchors = branches.filter((b) => !b.parentId && b.isAnchor);
  const children = branches.filter((b) => !!b.parentId);

  const nodes: MapNode[] = [];

  centralOrbiters.forEach((b, i) => {
    const radius = 160 + (i % 5) * 70;
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: null,
      isAnchor: false,
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      angle: (i / Math.max(centralOrbiters.length, 1)) * Math.PI * 2,
      orbitRadius: radius,
      orbitSpeed: 0.05 + Math.random() * 0.04,
      wanderSeed: Math.random() * 1000,
    });
  });

  anchors.forEach((b) => {
    // Uneven scatter — not a clean grid or perfect circle, deliberately.
    const angle = Math.random() * Math.PI * 2;
    const radius = 350 + Math.random() * WORLD_SPREAD;
    const bx = Math.cos(angle) * radius;
    const by = Math.sin(angle) * radius;
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: null,
      isAnchor: true,
      x: bx,
      y: by,
      homeX: bx,
      homeY: by,
      angle: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      wanderSeed: Math.random() * 1000,
    });
  });

  children.forEach((b, i) => {
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: b.parentId,
      isAnchor: false,
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      angle: (i / 3) * Math.PI * 2,
      orbitRadius: 60 + (i % 3) * 30,
      orbitSpeed: 0.08 + Math.random() * 0.06,
      wanderSeed: Math.random() * 1000,
    });
  });

  return nodes;
}

export function SpaceMap({ branches, centerLabel, centerHref }: { branches: Branch[]; centerLabel: string; centerHref: string }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const cameraRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const hoveredIdRef = useRef<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    nodesRef.current = buildNodes(branches);
  }, [branches]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        keysRef.current.add(e.key);
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.key);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // --- camera: keyboard acceleration + friction (inertia) ---
      const cam = cameraRef.current;
      const keys = keysRef.current;
      let ax = 0;
      let ay = 0;
      if (keys.has("ArrowLeft")) ax += CAMERA_ACCEL;
      if (keys.has("ArrowRight")) ax -= CAMERA_ACCEL;
      if (keys.has("ArrowUp")) ay += CAMERA_ACCEL;
      if (keys.has("ArrowDown")) ay -= CAMERA_ACCEL;
      if (!dragRef.current) {
        cam.vx += ax * dt;
        cam.vy += ay * dt;
        cam.vx *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
        cam.vy *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
        const speed = Math.hypot(cam.vx, cam.vy);
        if (speed > CAMERA_MAX_SPEED) {
          cam.vx = (cam.vx / speed) * CAMERA_MAX_SPEED;
          cam.vy = (cam.vy / speed) * CAMERA_MAX_SPEED;
        }
        cam.x += cam.vx * dt;
        cam.y += cam.vy * dt;
      }

      // --- nodes: orbit/wander home position, spring + repulsion ---
      const nodes = nodesRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const t = now / 1000;

      for (const n of nodes) {
        if (n.id === hoveredIdRef.current) continue; // frozen while hovered

        if (n.parentId !== null) {
          const parent = byId.get(n.parentId);
          n.angle += n.orbitSpeed * dt;
          if (parent) {
            n.homeX = parent.x + Math.cos(n.angle) * n.orbitRadius;
            n.homeY = parent.y + Math.sin(n.angle) * n.orbitRadius;
          }
        }
        // Anchors: homeX/homeY intentionally untouched here — they stay at
        // their scattered base spot; the wander offset below is what
        // actually moves them, gently, around that fixed point.
        else if (!n.isAnchor) {
          n.angle += n.orbitSpeed * dt;
          n.homeX = Math.cos(n.angle) * n.orbitRadius;
          n.homeY = Math.sin(n.angle) * n.orbitRadius;
        }

        const wanderX = n.isAnchor ? Math.sin(t * 0.3 + n.wanderSeed) * 18 : 0;
        const wanderY = n.isAnchor ? Math.cos(t * 0.25 + n.wanderSeed) * 18 : 0;
        const targetX = n.homeX + wanderX;
        const targetY = n.homeY + wanderY;

        let fx = (targetX - n.x) * SPRING;
        let fy = (targetY - n.y) * SPRING;

        for (const other of nodes) {
          if (other === n) continue;
          const dx = n.x - other.x;
          const dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < REPEL_RADIUS) {
            const push = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }

        n.x += (fx / DAMPING) * dt;
        n.y += (fy / DAMPING) * dt;
      }

      // Re-render roughly 30fps worth of React updates — the physics loop
      // itself still runs every animation frame for smoothness.
      frameCount++;
      if (frameCount % 2 === 0) setRenderTick((v) => v + 1);

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".space-node")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, camX: cameraRef.current.x, camY: cameraRef.current.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    cameraRef.current.x = dragRef.current.camX + (e.clientX - dragRef.current.startX);
    cameraRef.current.y = dragRef.current.camY + (e.clientY - dragRef.current.startY);
  }
  function handleMouseUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="space-map"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      tabIndex={0}
    >
      <div
        className="space-map-field"
        style={{ transform: `translate(${cameraRef.current.x}px, ${cameraRef.current.y}px)` }}
      >
        <div className="space-node space-node-center" onClick={() => navigate(centerHref)} style={{ left: 0, top: 0 }}>
          {centerLabel}
        </div>

        {nodesRef.current.map((n) => (
          <div
            key={n.id}
            className={`space-node ${n.isAnchor ? "space-node-anchor" : ""}`}
            style={{ left: n.x, top: n.y }}
            onMouseEnter={() => {
              hoveredIdRef.current = n.id;
              setHoveredId(n.id);
            }}
            onMouseLeave={() => {
              hoveredIdRef.current = null;
              setHoveredId(null);
            }}
            onClick={() => navigate(`/branch/${n.slug}`)}
          >
            {n.name}
            {hoveredId === n.id && <span className="space-node-frozen-dot" />}
          </div>
        ))}
      </div>
      <p className="space-map-hint">Arrow keys or drag to move around. Hover a node to freeze it.</p>
    </div>
  );
}
