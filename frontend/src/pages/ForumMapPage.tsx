import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS";
  parentId: number | null;
  x: number;
  y: number;
  channel: { slug: string; name: string; kind: "DISCUSSION" | "BRANCH_LINKED"; branchId: number | null } | null;
}

export function ForumMapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [hoveredSpecial, setHoveredSpecial] = useState<number | null>(null);
  const [activeBranchChannels, setActiveBranchChannels] = useState<{ slug: string; name: string }[]>([]);
  const [growingSeedChannels, setGrowingSeedChannels] = useState<{ slug: string; name: string }[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<MapNode[]>("/api/forum-map").then(setNodes);
  }, []);

  useEffect(() => {
    // Split matches DiscussionIndexPage exactly: BABY_CRYSTALS branches are
    // "Growing Seeds", everything else with a channel is "Active Branches".
    api<{ visibility: string; channel: { slug: string; name: string } | null }[]>("/api/branches").then((branches) => {
      const withChannel = branches.filter((b) => b.channel);
      setActiveBranchChannels(withChannel.filter((b) => b.visibility !== "BABY_CRYSTALS").map((b) => ({ slug: b.channel!.slug, name: b.channel!.name })));
      setGrowingSeedChannels(withChannel.filter((b) => b.visibility === "BABY_CRYSTALS").map((b) => ({ slug: b.channel!.slug, name: b.channel!.name })));
    });
  }, []);

  function nodeLabel(n: MapNode): string {
    if (n.type === "ACTIVE_BRANCHES") return "Active Branches";
    if (n.type === "GROWING_SEEDS") return "Growing Seeds";
    return n.channel?.name ?? "";
  }

  function handleNodeClick(n: MapNode) {
    if (n.type === "TOPIC" && n.channel) navigate(`/topic/${n.channel.slug}`);
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
          const isSpecial = n.type !== "TOPIC";
          const radius = isSpecial ? 22 : 14;
          const color = isSpecial ? "#c9a7ff" : "#8fd3ff";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.type === "TOPIC" ? "pointer" : "default" }}
              onClick={() => handleNodeClick(n)}
              onMouseEnter={() => isSpecial && setHoveredSpecial(n.id)}
              onMouseLeave={() => isSpecial && setHoveredSpecial(null)}
            >
              <circle r={radius} fill={color} opacity={0.85} filter="url(#forum-map-glow)" />
              <circle r={radius * 0.4} fill="#fff" opacity={0.9} />
              <text y={radius + 16} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={12} fontFamily="var(--font-display)">
                {nodeLabel(n)}
              </text>

              {isSpecial && hoveredSpecial === n.id && (
                <foreignObject x={radius + 10} y={-40} width={200} height={200}>
                  <div
                    style={{
                      background: "rgba(15,10,25,0.92)",
                      border: "1px solid rgba(180,150,255,0.4)",
                      borderRadius: 8,
                      padding: "0.5rem",
                      fontSize: "0.8rem",
                      color: "#e8e0ff",
                      maxHeight: 180,
                      overflowY: "auto",
                    }}
                  >
                    {(() => {
                      const list = n.type === "ACTIVE_BRANCHES" ? activeBranchChannels : growingSeedChannels;
                      return list.length === 0 ? (
                        <div style={{ opacity: 0.6 }}>Nothing here yet.</div>
                      ) : (
                        list.map((b) => (
                          <div
                            key={b.slug}
                            style={{ padding: "0.15rem 0", cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/topic/${b.slug}`);
                            }}
                          >
                            {b.name}
                          </div>
                        ))
                      );
                    })()}
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
