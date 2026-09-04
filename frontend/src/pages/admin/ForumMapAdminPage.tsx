import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS";
  parentId: number | null;
  x: number;
  y: number;
  channel: { slug: string; name: string } | null;
}

interface ChannelOption {
  slug: string;
  name: string;
  id: number;
  branchId: number | null;
}

export function ForumMapAdminPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [newType, setNewType] = useState<"TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS">("TOPIC");
  const [newChannelId, setNewChannelId] = useState<number | "">("");
  const dragNodeId = useRef<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  function load() {
    api<MapNode[]>("/api/forum-map").then(setNodes);
  }
  useEffect(load, []);
  useEffect(() => {
    api<{ id: number; slug: string; name: string; branchId: number | null }[]>("/api/channels").then(setChannels);
  }, []);

  const usedChannelIds = new Set(nodes.map((n) => n.channel?.slug));
  const availableChannels = channels.filter((c) => !usedChannelIds.has(c.slug));

  async function addNode() {
    if (!newChannelId) return;
    await api("/api/admin/forum-map/nodes", {
      method: "POST",
      body: JSON.stringify({ type: newType, channelId: newChannelId, x: 0, y: 0 }),
    });
    setNewChannelId("");
    load();
  }

  async function removeNode(id: number) {
    await api(`/api/admin/forum-map/nodes/${id}`, { method: "DELETE" });
    load();
  }

  async function setParent(id: number, parentId: number | null) {
    await api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
    load();
  }

  function svgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return { x: 0, y: 0 };
    const local = pt.matrixTransform(screenCTM.inverse());
    return { x: local.x, y: local.y };
  }

  function onNodePointerDown(e: React.PointerEvent, n: MapNode) {
    e.stopPropagation();
    const p = svgPoint(e.clientX, e.clientY);
    dragNodeId.current = n.id;
    dragOffset.current = { x: p.x - n.x, y: p.y - n.y };
  }
  function onSvgPointerMove(e: React.PointerEvent) {
    if (dragNodeId.current === null) return;
    const p = svgPoint(e.clientX, e.clientY);
    const id = dragNodeId.current;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x: p.x - dragOffset.current.x, y: p.y - dragOffset.current.y } : n)));
  }
  async function onSvgPointerUp() {
    const id = dragNodeId.current;
    dragNodeId.current = null;
    if (id === null) return;
    const n = nodes.find((n) => n.id === id);
    if (n) await api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify({ x: n.x, y: n.y }) });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      <h1>Forum Map</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Drag nodes to position them. Set each node's parent below to draw a branch to it.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}>
        <div>
          <label>Node type</label>
          <select value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)}>
            <option value="TOPIC">Topic</option>
            <option value="ACTIVE_BRANCHES">Active Branch (styled)</option>
            <option value="GROWING_SEEDS">Growing Seed (styled)</option>
          </select>
        </div>
        <div>
          <label>Channel</label>
          <select value={newChannelId} onChange={(e) => setNewChannelId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— select —</option>
            {availableChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.branchId ? `[Branch] ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={addNode}>
          Add node
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox="-800 -800 1600 1600"
        style={{ width: "100%", height: "60vh", background: "#0d0a14", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
      >
        {nodes
          .filter((n) => n.parentId !== null)
          .map((n) => {
            const parent = byId.get(n.parentId!);
            if (!parent) return null;
            return (
              <line key={`edge-${n.id}`} x1={parent.x} y1={parent.y} x2={n.x} y2={n.y} stroke="rgba(150,120,220,0.5)" strokeWidth={1.5} />
            );
          })}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`} onPointerDown={(e) => onNodePointerDown(e, n)} style={{ cursor: "grab" }}>
            <circle
              r={n.type === "TOPIC" ? 14 : 18}
              fill={n.type === "TOPIC" ? "#8fd3ff" : n.type === "ACTIVE_BRANCHES" ? "#a7ffc9" : "#c9a7ff"}
              opacity={0.85}
            />
            <text y={n.type === "TOPIC" ? 30 : 38} textAnchor="middle" fill="#fff" fontSize={11}>
              {n.type === "ACTIVE_BRANCHES" ? `[Active] ${n.channel?.name}` : n.type === "GROWING_SEEDS" ? `[Growing] ${n.channel?.name}` : n.channel?.name}
            </text>
          </g>
        ))}
      </svg>

      <table style={{ width: "100%", marginTop: "1rem", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Node</th>
            <th style={{ textAlign: "left" }}>Parent</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>{n.type === "ACTIVE_BRANCHES" ? `[Active] ${n.channel?.name}` : n.type === "GROWING_SEEDS" ? `[Growing] ${n.channel?.name}` : n.channel?.name}</td>
              <td>
                <select value={n.parentId ?? ""} onChange={(e) => setParent(n.id, e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— none (root) —</option>
                  {nodes
                    .filter((c) => c.id !== n.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.type === "TOPIC" ? c.channel?.name : c.type === "ACTIVE_BRANCHES" ? "Active Branches" : "Growing Seeds"}
                      </option>
                    ))}
                </select>
              </td>
              <td>
                <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => removeNode(n.id)}>
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
