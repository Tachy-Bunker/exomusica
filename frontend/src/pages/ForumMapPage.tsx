import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useIsDesktop } from "../lib/useIsDesktop";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS";
  parentId: number | null;
  x: number;
  y: number;
  channel: { slug: string; name: string } | null;
}

interface PreviewMessage {
  id: number;
  authorUsername: string;
  contentRaw: string;
}

const NODE_STYLE: Record<MapNode["type"], { radius: number; color: string }> = {
  TOPIC: { radius: 14, color: "#8fd3ff" },
  ACTIVE_BRANCHES: { radius: 18, color: "#a7ffc9" },
  GROWING_SEEDS: { radius: 18, color: "#c9a7ff" },
};

// Deterministic pseudo-random satellite orbs per node, "The Void"-style —
// a handful of small dangling lights on thin strands around each node,
// varied but stable across re-renders (seeded from the node's own id
// rather than Math.random(), so they don't reshuffle every render).
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function satellites(nodeId: number, baseRadius: number) {
  const rand = seededRand(nodeId * 7919);
  const count = 3 + Math.floor(rand() * 3); // 3-5
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.6;
    const dist = baseRadius + 18 + rand() * 22;
    const size = 2 + rand() * 3;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size, delay: rand() * 3 };
  });
}

export function ForumMapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewMessage[]>([]);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();

  useEffect(() => {
    api<MapNode[]>("/api/forum-map").then(setNodes);
    api<{ forumMapInitialX: number; forumMapInitialY: number; forumMapInitialZoom: number }>("/api/site-settings").then((s) => {
      setPan({ x: s.forumMapInitialX, y: s.forumMapInitialY });
      setZoom(s.forumMapInitialZoom);
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
    if (n.channel) navigate(`/topic/${n.channel.slug}`);
  }

  function onNodeInteract(n: MapNode) {
    if (isDesktop) return; // desktop uses hover, not click
    setActiveNodeId((id) => (id === n.id ? null : n.id));
  }

  function svgPoint(clientX: number, clientY: number, svg: SVGSVGElement) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = (e.clientX - dragState.current.startX) / zoom;
    const dy = (e.clientY - dragState.current.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragState.current.moved = true;
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
  }
  function onPointerUp() {
    dragState.current = null;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vbSize = 1600 / zoom;

  return (
    <div
      style={{
        position: "relative",
        height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem - var(--player-height, 0px))",
        background: "radial-gradient(ellipse at center, #0d0a14 0%, #050308 70%)",
        overflow: "hidden",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        cursor: dragState.current ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={(e) => setZoom((z) => Math.min(2.5, Math.max(0.4, z - e.deltaY * 0.001)))}
    >
      <style>{`
        @keyframes forumMapTwinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.9; }
        }
        @keyframes forumMapPulse {
          0%, 100% { r: var(--pulse-r-min); }
          50% { r: var(--pulse-r-max); }
        }
      `}</style>

      <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate("/discussion")}>
        ← Back to Discussion
      </button>

      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, display: "flex", gap: "1rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#8fd3ff", marginRight: 4 }} />Topic</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#a7ffc9", marginRight: 4 }} />Active Branch</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#c9a7ff", marginRight: 4 }} />Growing Seed</span>
      </div>

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
          const orbs = satellites(n.id, radius);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.channel ? "pointer" : "default" }}
              onClick={(e) => {
                if (dragState.current?.moved) return;
                e.stopPropagation();
                onNodeInteract(n);
              }}
              onMouseEnter={() => isDesktop && setActiveNodeId(n.id)}
              onMouseLeave={() => isDesktop && setActiveNodeId((id) => (id === n.id ? null : id))}
            >
              {/* Void-style satellite lights, each on its own thin strand */}
              {orbs.map((o, i) => (
                <g key={i}>
                  <path d={`M 0 0 Q ${o.x * 0.5} ${o.y * 0.5 - 6} ${o.x} ${o.y}`} fill="none" stroke="rgba(200,190,255,0.25)" strokeWidth={0.8} />
                  <circle
                    cx={o.x}
                    cy={o.y}
                    r={o.size}
                    fill={color}
                    style={{ animation: `forumMapTwinkle ${2.5 + o.delay}s ease-in-out infinite`, animationDelay: `${o.delay}s` }}
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
              <circle r={radius * 0.4} fill="#fff" opacity={0.9} />
              <text y={radius + 16} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={12} fontFamily="var(--font-display)">
                {n.channel?.name ?? ""}
              </text>

              {activeNodeId === n.id && (
                <foreignObject x={radius + 12} y={-50} width={220} height={220} style={{ pointerEvents: isDesktop ? "none" : "auto" }}>
                  <div
                    style={{
                      background: "rgba(15,10,25,0.94)",
                      border: "1px solid rgba(180,150,255,0.4)",
                      borderRadius: 8,
                      padding: "0.6rem",
                      fontSize: "0.75rem",
                      color: "#e8e0ff",
                      maxHeight: 190,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.3rem",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: "0.1rem" }}>{n.channel?.name}</div>
                    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                      {preview.length === 0 ? (
                        <div style={{ opacity: 0.6 }}>No messages yet.</div>
                      ) : (
                        [...preview].reverse().map((m) => (
                          <div key={m.id} style={{ marginBottom: "0.25rem", overflowWrap: "break-word" }}>
                            <span style={{ color: "#a7c9ff" }}>{m.authorUsername}:</span> {m.contentRaw.slice(0, 80)}
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
