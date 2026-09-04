import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useChatDockStore } from "../lib/chatDockStore";
import { Joystick } from "../components/Joystick";
import { isTypingTarget } from "../lib/isTypingTarget";
import { getRMS } from "../lib/audioAnalyser";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS";
  parentId: number | null;
  x: number;
  y: number;
  color: string | null;
  size: number | null;
  channel: { slug: string; name: string; contentMarkdown: string | null } | null;
}

interface PreviewMessage {
  id: number;
  authorUsername: string;
  contentRaw: string;
}

// Site's own accent colors, not arbitrary ones — forum's established
// identity is the accretion-disk orange-red, audio's is the pulsar blue.
const NODE_STYLE: Record<MapNode["type"], { radius: number; color: string }> = {
  TOPIC: { radius: 14, color: "#e2703f" },
  ACTIVE_BRANCHES: { radius: 19, color: "#f0a06a" },
  GROWING_SEEDS: { radius: 19, color: "#4fa8e0" },
};

// Matches the spacemap's own camera feel exactly, just adapted to
// screen-pixel-equivalent units (converted to SVG units per frame via
// pxToSvgUnits) so speed stays consistent regardless of zoom level —
// the admin's configured multiplier applies on top of this baseline.
const CAMERA_ACCEL = 900;
const CAMERA_FRICTION = 5;
const CAMERA_MAX_SPEED = 450;
const CROSSHAIR_LOOKAHEAD = 0.16;
const CROSSHAIR_MAX_OFFSET = 65;
const CROSSHAIR_CATCHUP_RATE = 2.2;
const LOCK_RADIUS_PX = 60;

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
// Neural-dendrite-style branches per node: each one forks partway, like
// the synapse reference images, rather than a single straight strand out
// to a satellite orb.
function dendrites(nodeId: number, baseRadius: number) {
  const rand = seededRand(nodeId * 7919);
  const count = 4 + Math.floor(rand() * 3); // 4-6
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.5;
    const len1 = baseRadius + 14 + rand() * 16;
    const len2 = len1 + 10 + rand() * 14;
    const forkAngle = angle + (rand() - 0.5) * 0.9;
    const mid = { x: Math.cos(angle) * len1, y: Math.sin(angle) * len1 };
    const tip = { x: mid.x + Math.cos(angle) * (len2 - len1), y: mid.y + Math.sin(angle) * (len2 - len1) };
    const forkTip = { x: mid.x + Math.cos(forkAngle) * (len2 - len1) * 0.8, y: mid.y + Math.sin(forkAngle) * (len2 - len1) * 0.8 };
    return {
      mid,
      tip,
      forkTip,
      glowSize: 1.5 + rand() * 2,
      delay: rand() * 3,
      pluckDuration: 6 + rand() * 8, // 6-14s idle cycle, most of it still
      pluckDelay: rand() * 12,
    };
  });
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function ForumMapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [navSpeed, setNavSpeed] = useState(1);
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startClientX: number; startClientY: number; panX: number; panY: number; moved: boolean; startNodeId: number | null } | null>(null);
  const pinchState = useRef<{ startDist: number; startZoom: number } | null>(null);
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const openChat = useChatDockStore((s) => s.openChat);
  const keysRef = useRef<Set<string>>(new Set());
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const cameraVelRef = useRef({ vx: 0, vy: 0 });
  const crosshairOffsetRef = useRef({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const navSpeedRef = useRef(navSpeed);
  navSpeedRef.current = navSpeed;
  const [lockedNodeId, setLockedNodeId] = useState<number | null>(null);
  const lockedNodeIdRef = useRef<number | null>(null);
  const nodesRef = useRef<MapNode[]>([]);
  nodesRef.current = nodes;

  useEffect(() => {
    api<MapNode[]>("/api/forum-map").then(setNodes);
    api<{ forumMapInitialX: number; forumMapInitialY: number; forumMapInitialZoom: number; forumMapNavSpeed: number }>("/api/site-settings").then((s) => {
      setPan({ x: s.forumMapInitialX ?? 0, y: s.forumMapInitialY ?? 0 });
      setZoom(s.forumMapInitialZoom ?? 1);
      setNavSpeed(s.forumMapNavSpeed ?? 1);
    });
  }, []);

  const activeNode = useMemo(() => nodes.find((n) => n.id === activeNodeId) ?? null, [nodes, activeNodeId]);

  useEffect(() => {
    if (!activeNode?.channel) {
      setPreview([]);
      return;
    }
    api<PreviewMessage[]>(`/api/channels/${activeNode.channel.slug}/messages?limit=4`).then(setPreview);
  }, [activeNode]);

  function goToNode(n: MapNode) {
    if (!n.channel) return;
    if (isDesktop && !n.channel.contentMarkdown) {
      openChat(n.channel.slug, n.channel.name);
      return;
    }
    navigate(`/topic/${n.channel.slug}`);
  }

  function onNodeInteract(n: MapNode) {
    if (isDesktop) {
      goToNode(n); // hover already shows the preview, so a click/E-lock just acts
      return;
    }
    setActiveNodeId((id) => (id === n.id ? null : n.id));
  }

  // --- WASD + crosshair lock-on (desktop) / joystick (mobile) -----------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) keysRef.current.add(e.code);
      if (e.code === "KeyE") {
        const n = nodesRef.current.find((n) => n.id === lockedNodeIdRef.current);
        if (n) onNodeInteract(n);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.code);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const keys = keysRef.current;
      const joy = joystickVectorRef.current;
      let ax = 0;
      let ay = 0;
      if (keys.has("KeyA")) ax += CAMERA_ACCEL;
      if (keys.has("KeyD")) ax -= CAMERA_ACCEL;
      if (keys.has("KeyW")) ay += CAMERA_ACCEL;
      if (keys.has("KeyS")) ay -= CAMERA_ACCEL;
      ax -= joy.x * CAMERA_ACCEL;
      ay -= joy.y * CAMERA_ACCEL;
      ax *= navSpeedRef.current;
      ay *= navSpeedRef.current;

      const cam = cameraVelRef.current;
      if (!dragState.current) {
        cam.vx += ax * dt;
        cam.vy += ay * dt;
        cam.vx *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
        cam.vy *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
        const speed = Math.hypot(cam.vx, cam.vy);
        const maxSpeed = CAMERA_MAX_SPEED * navSpeedRef.current;
        if (speed > maxSpeed) {
          cam.vx = (cam.vx / speed) * maxSpeed;
          cam.vy = (cam.vy / speed) * maxSpeed;
        }
        if (Math.abs(cam.vx) > 0.05 || Math.abs(cam.vy) > 0.05) {
          const el = containerRef.current;
          const vbSize = 1600 / zoomRef.current;
          const pxToUnit = el ? vbSize / el.clientWidth : 1;
          const p = panRef.current;
          const next = { x: p.x - cam.vx * dt * pxToUnit, y: p.y - cam.vy * dt * pxToUnit };
          panRef.current = next;
          setPan(next);
        }
      }

      // Crosshair inertia — leads the camera's velocity, then eases back
      // to center once it settles, same feel as the spacemap reticle.
      {
        const targetX = Math.max(-CROSSHAIR_MAX_OFFSET, Math.min(CROSSHAIR_MAX_OFFSET, -cam.vx * CROSSHAIR_LOOKAHEAD));
        const targetY = Math.max(-CROSSHAIR_MAX_OFFSET, Math.min(CROSSHAIR_MAX_OFFSET, -cam.vy * CROSSHAIR_LOOKAHEAD));
        const co = crosshairOffsetRef.current;
        co.x += (targetX - co.x) * Math.min(CROSSHAIR_CATCHUP_RATE * dt, 1);
        co.y += (targetY - co.y) * Math.min(CROSSHAIR_CATCHUP_RATE * dt, 1);
        if (reticleRef.current) reticleRef.current.style.transform = `translate(-50%, -50%) translate(${co.x}px, ${co.y}px)`;
      }

      // Lock-on: nearest node to screen center, within radius, converted
      // through the same viewBox math the rest of the map uses.
      const el = containerRef.current;
      if (el) {
        const vbSize = 1600 / zoomRef.current;
        const pxPerUnit = el.clientWidth / vbSize;
        let nearest: MapNode | null = null;
        let nearestDist = LOCK_RADIUS_PX;
        for (const n of nodesRef.current) {
          const screenX = (n.x + panRef.current.x) * pxPerUnit;
          const screenY = (n.y + panRef.current.y) * pxPerUnit;
          const d = Math.hypot(screenX, screenY);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = n;
          }
        }
        const nextLockedId = nearest?.id ?? null;
        if (nextLockedId !== lockedNodeIdRef.current) {
          lockedNodeIdRef.current = nextLockedId;
          setLockedNodeId(nextLockedId);
          if (isDesktop) setActiveNodeId(nextLockedId);
        }
      }

      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  // RMS-driven pluck intensity — throttled well below animation-frame
  // rate since this only needs to feel responsive, not be perfectly
  // smooth, and updates the CSS variable directly rather than through
  // React state to avoid re-rendering the whole node tree constantly.
  useEffect(() => {
    const interval = setInterval(() => {
      const rms = getRMS(); // 0 when nothing's playing
      const intensity = 0.3 + Math.min(1, rms * 3) * 0.9; // baseline idle life, boosted while audio plays
      containerRef.current?.style.setProperty("--rms", intensity.toFixed(2));
    }, 120);
    return () => clearInterval(interval);
  }, []);

  function handleJoystickMove(dx: number, dy: number) {
    joystickVectorRef.current = { x: dx, y: dy };
  }
  function handleJoystickRelease() {
    joystickVectorRef.current = { x: 0, y: 0 };
  }

  // Screen-pixel deltas converted through the container's actual rendered
  // size against the viewBox size, not just divided by zoom — the earlier
  // version assumed the container was exactly as wide as the base viewBox,
  // which is essentially never true, so panning felt broken/unresponsive.
  function pxToSvgUnits(px: number) {
    const el = containerRef.current;
    if (!el) return px;
    const vbSize = 1600 / zoom;
    return (px / el.clientWidth) * vbSize;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return; // touch handled separately, for pinch support
    if ((e.target as HTMLElement).closest?.("button, a")) return; // let clicks on controls behave normally, uninterfered with
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const nodeEl = (e.target as HTMLElement).closest?.("[data-node-id]");
    const startNodeId = nodeEl ? Number(nodeEl.getAttribute("data-node-id")) : null;
    dragState.current = { startClientX: e.clientX, startClientY: e.clientY, panX: pan.x, panY: pan.y, moved: false, startNodeId };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const rawDx = e.clientX - dragState.current.startClientX;
    const rawDy = e.clientY - dragState.current.startClientY;
    if (Math.abs(rawDx) + Math.abs(rawDy) > 4) dragState.current.moved = true;
    setPan({ x: dragState.current.panX + pxToSvgUnits(rawDx), y: dragState.current.panY + pxToSvgUnits(rawDy) });
  }
  // Clicks are detected here, on pointerup, rather than relying on the
  // browser's native "click" event — setPointerCapture on the container
  // (needed so a fast drag can't slip outside the element mid-gesture)
  // retargets pointerup to the container too, which can prevent a
  // separately-synthesized click from ever reaching the node that was
  // actually pressed. Tracking which node (if any) the gesture started on
  // ourselves sidesteps that entirely.
  function onPointerUp() {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag || drag.moved || drag.startNodeId === null) return;
    const n = nodesRef.current.find((n) => n.id === drag.startNodeId);
    if (n) onNodeInteract(n);
  }

  // Touch: one finger pans, two fingers pinch-zoom (and pan together).
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const nodeEl = (e.target as HTMLElement).closest?.("[data-node-id]");
      const startNodeId = nodeEl ? Number(nodeEl.getAttribute("data-node-id")) : null;
      dragState.current = { startClientX: t.clientX, startClientY: t.clientY, panX: pan.x, panY: pan.y, moved: false, startNodeId };
    } else if (e.touches.length === 2) {
      dragState.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchState.current = { startDist: dist({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY }), startZoom: zoom };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchState.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = dist({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY });
      const ratio = d / pinchState.current.startDist;
      setZoom(Math.min(2.5, Math.max(0.4, pinchState.current.startZoom * ratio)));
      return;
    }
    if (e.touches.length === 1 && dragState.current) {
      const t = e.touches[0];
      const rawDx = t.clientX - dragState.current.startClientX;
      const rawDy = t.clientY - dragState.current.startClientY;
      if (Math.abs(rawDx) + Math.abs(rawDy) > 4) dragState.current.moved = true;
      setPan({ x: dragState.current.panX + pxToSvgUnits(rawDx), y: dragState.current.panY + pxToSvgUnits(rawDy) });
    }
  }
  function onTouchEnd() {
    const drag = dragState.current;
    dragState.current = null;
    pinchState.current = null;
    if (!drag || drag.moved || drag.startNodeId === null) return;
    const n = nodesRef.current.find((n) => n.id === drag.startNodeId);
    if (n) onNodeInteract(n);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vbSize = 1600 / zoom;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem - var(--player-height, 0px))",
        background: "radial-gradient(ellipse at center, var(--bg-elevated) 0%, var(--bg-inset) 70%)",
        overflow: "hidden",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        cursor: dragState.current ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={(e) => setZoom((z) => Math.min(2.5, Math.max(0.4, z - e.deltaY * 0.001)))}
    >
      <style>{`
        @keyframes forumMapTwinkle {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes forumMapPulse {
          0%, 100% { r: var(--pulse-r-min); }
          50% { r: var(--pulse-r-max); }
        }
        @keyframes forumMapCrackle {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.9; }
        }
        @keyframes forumMapPluck {
          0% { transform: rotate(0deg); }
          2% { transform: rotate(calc(4deg * var(--rms, 0.35))); }
          4% { transform: rotate(calc(-3deg * var(--rms, 0.35))); }
          6% { transform: rotate(calc(2deg * var(--rms, 0.35))); }
          8%, 100% { transform: rotate(0deg); }
        }
      `}</style>

      <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate("/discussion")}>
        View as list
      </button>

      {isDesktop && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 5, display: "flex", gap: "0.3rem" }}>
          <button className="btn" style={{ padding: "0.2rem 0.7rem" }} onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} title="Zoom in">
            +
          </button>
          <button className="btn" style={{ padding: "0.2rem 0.7rem" }} onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} title="Zoom out">
            −
          </button>
        </div>
      )}

      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: NODE_STYLE.TOPIC.color, marginRight: 4 }} />Topic</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: NODE_STYLE.ACTIVE_BRANCHES.color, marginRight: 4 }} />Active Branch</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: NODE_STYLE.GROWING_SEEDS.color, marginRight: 4 }} />Growing Seed</span>
      </div>

      {isDesktop && (
        <div className="space-reticle" ref={reticleRef}>
          <div
            className="space-reticle-ring"
            style={{ background: lockedNodeId !== null ? "conic-gradient(var(--accent-forum) 360deg, transparent 0deg)" : undefined }}
          />
          <div className="space-reticle-cross" />
        </div>
      )}
      {isDesktop && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: lockedNodeId !== null ? "0.85rem" : "0.75rem", color: lockedNodeId !== null ? "var(--text)" : "var(--text-dim)", textAlign: "center" }}>
          {lockedNodeId !== null ? (
            <>
              Press <strong style={{ color: "var(--accent-forum)" }}>E</strong> to enter
            </>
          ) : (
            "WASD to navigate"
          )}
        </div>
      )}
      {!isDesktop && (
        <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 5 }}>
          <Joystick onMove={handleJoystickMove} onRelease={handleJoystickRelease} />
        </div>
      )}

      <svg
        viewBox={`${-vbSize / 2 - pan.x} ${-vbSize / 2 - pan.y} ${vbSize} ${vbSize}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <filter id="forum-map-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Thick, jagged synapse-like connections between nodes — Phazon
            crack aesthetic rather than a smooth clean curve. */}
        {nodes
          .filter((n) => n.parentId !== null)
          .map((n) => {
            const parent = byId.get(n.parentId!);
            if (!parent) return null;
            const midX = (parent.x + n.x) / 2 + (n.id % 7) - 3;
            const midY = (parent.y + n.y) / 2 - 30 + (n.id % 5) - 2;
            return (
              <g key={`edge-${n.id}`}>
                <path
                  d={`M ${parent.x} ${parent.y} Q ${midX} ${midY} ${n.x} ${n.y}`}
                  fill="none"
                  stroke="var(--accent-forum-dim)"
                  strokeWidth={2.5}
                  opacity={0.5}
                  style={{ animation: "forumMapCrackle 3.5s ease-in-out infinite" }}
                />
                <path d={`M ${parent.x} ${parent.y} Q ${midX} ${midY} ${n.x} ${n.y}`} fill="none" stroke="var(--accent-forum)" strokeWidth={0.8} opacity={0.6} />
              </g>
            );
          })}

        {nodes.map((n) => {
          const fallback = NODE_STYLE[n.type];
          const radius = n.size ?? fallback.radius;
          const color = n.color ?? fallback.color;
          const branches = dendrites(n.id, radius);
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.channel ? "pointer" : "default" }}
              onMouseEnter={() => isDesktop && setActiveNodeId(n.id)}
              onMouseLeave={() => isDesktop && setActiveNodeId((id) => (id === n.id ? null : id))}
            >
              {/* Neural dendrites — forked branches with a small glowing
                  terminal at each fork, like a synapse. */}
              {branches.map((b, i) => (
                <g
                  key={i}
                  style={{
                    transformOrigin: "0px 0px",
                    animation: `forumMapPluck ${b.pluckDuration}s ease-in-out infinite`,
                    animationDelay: `${b.pluckDelay}s`,
                  }}
                >
                  <path d={`M 0 0 L ${b.mid.x} ${b.mid.y} L ${b.tip.x} ${b.tip.y}`} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} />
                  <path d={`M ${b.mid.x} ${b.mid.y} L ${b.forkTip.x} ${b.forkTip.y}`} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />
                  <circle
                    cx={b.tip.x}
                    cy={b.tip.y}
                    r={b.glowSize}
                    fill={color}
                    style={{ animation: `forumMapTwinkle ${2.5 + b.delay}s ease-in-out infinite`, animationDelay: `${b.delay}s` }}
                  />
                  <circle
                    cx={b.forkTip.x}
                    cy={b.forkTip.y}
                    r={b.glowSize * 0.7}
                    fill={color}
                    style={{ animation: `forumMapTwinkle ${2.5 + b.delay}s ease-in-out infinite`, animationDelay: `${b.delay + 1}s` }}
                  />
                </g>
              ))}

              <circle
                r={radius}
                fill={color}
                opacity={0.85}
                filter="url(#forum-map-glow)"
                style={{ "--pulse-r-min": `${radius}px`, "--pulse-r-max": `${radius * 1.15}px`, animation: "forumMapPulse 4s ease-in-out infinite" } as React.CSSProperties}
              />
              <circle r={radius * 0.4} fill="var(--text)" opacity={0.9} />
              <text y={radius + 16} textAnchor="middle" fill="var(--text-dim)" fontSize={12} fontFamily="var(--font-display)">
                {n.channel?.name ?? ""}
              </text>

              {activeNodeId === n.id && (
                <foreignObject x={radius + 12} y={-50} width={220} height={220} style={{ pointerEvents: isDesktop ? "none" : "auto" }}>
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0.6rem",
                      fontSize: "0.75rem",
                      color: "var(--text)",
                      maxHeight: 190,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.3rem",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: "0.1rem" }}>{n.channel?.name}</div>
                    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                      {preview.length === 0 ? (
                        <div style={{ color: "var(--text-dim)" }}>No messages yet.</div>
                      ) : (
                        [...preview].reverse().map((m) => (
                          <div key={m.id} style={{ marginBottom: "0.25rem", overflowWrap: "break-word" }}>
                            <span style={{ color: "var(--accent-audio)" }}>{m.authorUsername}:</span> {m.contentRaw.slice(0, 80)}
                          </div>
                        ))
                      )}
                    </div>
                    {!isDesktop && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: "0.75rem", alignSelf: "flex-start" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToNode(n);
                        }}
                      >
                        Go →
                      </button>
                    )}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
