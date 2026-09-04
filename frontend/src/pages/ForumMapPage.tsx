import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS";
  parentId: number | null;
  x: number;
  y: number;
  channel: { slug: string; name: string } | null;
}

const NODE_STYLE: Record<MapNode["type"], { radius: number; color: string }> = {
  TOPIC: { radius: 14, color: "#8fd3ff" },
  ACTIVE_BRANCHES: { radius: 18, color: "#a7ffc9" },
  GROWING_SEEDS: { radius: 18, color: "#c9a7ff" },
};

export function ForumMapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<MapNode[]>("/api/forum-map").then(setNodes);
  }, []);

  function handleNodeClick(n: MapNode) {
    if (n.channel) navigate(`/topic/${n.channel.slug}`);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
  }
  function onPointerUp() {
    dragState.current = null;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse at center, #0d0a14 0%, #050308 70%)",
        overflow: "hidden",
        cursor: dragState.current ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={(e) => setZoom((z) => Math.min(2.5, Math.max(0.4, z - e.deltaY * 0.001)))}
    >
      <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate("/discussion")}>
        ← Back to Discussion
      </button>

      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, display: "flex", gap: "1rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#8fd3ff", marginRight: 4 }} />Topic</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#a7ffc9", marginRight: 4 }} />Active Branch</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#c9a7ff", marginRight: 4 }} />Growing Seed</span>
      </div>

      <svg
        viewBox="-800 -800 1600 1600"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center",
        }}
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

        {nodes
          .filter((n) => n.parentId !== null)
          .map((n) => {
            const parent = byId.get(n.parentId!);
            if (!parent) return null;
            const midX = (parent.x + n.x) / 2;
            const midY = (parent.y + n.y) / 2 - 30;
            return (
              <path
                key={`edge-${n.id}`}
                d={`M ${parent.x} ${parent.y} Q ${midX} ${midY} ${n.x} ${n.y}`}
                fill="none"
                stroke="rgba(150,120,220,0.35)"
                strokeWidth={1.5}
              />
            );
          })}

        {nodes.map((n) => {
          const { radius, color } = NODE_STYLE[n.type];
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.channel ? "pointer" : "default" }}
              onClick={() => handleNodeClick(n)}
            >
              <circle r={radius} fill={color} opacity={0.85} filter="url(#forum-map-glow)" />
              <circle r={radius * 0.4} fill="#fff" opacity={0.9} />
              <text y={radius + 16} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={12} fontFamily="var(--font-display)">
                {n.channel?.name ?? ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
