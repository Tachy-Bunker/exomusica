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

function nodeLabel(n: MapNode): string {
  const name = n.channel?.name ?? "";
  if (n.type === "ACTIVE_BRANCHES") return `[Active] ${name}`;
  if (n.type === "GROWING_SEEDS") return `[Growing] ${name}`;
  return name;
}

export function ForumMapAdminPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [newType, setNewType] = useState<"TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS">("TOPIC");
  const [newChannelId, setNewChannelId] = useState<number | "">("");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragNodeId = useRef<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function load() {
    api<MapNode[]>("/api/forum-map").then(setNodes);
  }
  useEffect(load, []);
  useEffect(() => {
    api<ChannelOption[]>("/api/channels").then(setChannels);
  }, []);
  useEffect(() => {
    api<{ forumMapInitialX: number; forumMapInitialY: number; forumMapInitialZoom: number }>("/api/site-settings").then((s) => {
      setPan({ x: s.forumMapInitialX, y: s.forumMapInitialY });
      setZoom(s.forumMapInitialZoom);
    });
  }, []);

  const usedChannelIds = new Set(nodes.map((n) => n.channel?.slug));
  const availableChannels = channels.filter((c) => !usedChannelIds.has(c.slug));

  async function addNode() {
    if (!newChannelId) return;
    await api("/api/admin/forum-map/nodes", {
      method: "POST",
      body: JSON.stringify({ type: newType, channelId: newChannelId, x: -pan.x, y: -pan.y }),
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

  async function saveDefaultView() {
    await api("/api/admin/site-settings", {
      method: "PATCH",
      body: JSON.stringify({ forumMapInitialX: pan.x, forumMapInitialY: pan.y, forumMapInitialZoom: zoom }),
    });
    alert("Saved. This is now the view visitors land on when opening the map.");
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
  function onBackgroundPointerDown(e: React.PointerEvent) {
    panDrag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onSvgPointerMove(e: React.PointerEvent) {
    if (dragNodeId.current !== null) {
      const p = svgPoint(e.clientX, e.clientY);
      const id = dragNodeId.current;
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x: p.x - dragOffset.current.x, y: p.y - dragOffset.current.y } : n)));
      return;
    }
    if (panDrag.current) {
      const dx = (e.clientX - panDrag.current.startX) / zoom;
      const dy = (e.clientY - panDrag.current.startY) / zoom;
      setPan({ x: panDrag.current.panX + dx, y: panDrag.current.panY + dy });
    }
  }
  async function onSvgPointerUp() {
    panDrag.current = null;
    const id = dragNodeId.current;
    dragNodeId.current = null;
    if (id === null) return;
    const n = nodes.find((n) => n.id === id);
    if (n) await api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify({ x: n.x, y: n.y }) });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vbSize = 1600 / zoom;

  return (
    <div>
      <h1>Forum Map</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Drag nodes to position them. Drag the background to pan, scroll to zoom. Set each node's parent below to draw
        a branch to it. New nodes are added wherever the canvas is currently centered.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
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
        <button className="btn" onClick={saveDefaultView} title="Save the current pan/zoom as what visitors see when they first open the map">
          Set current view as default
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${-vbSize / 2 - pan.x} ${-vbSize / 2 - pan.y} ${vbSize} ${vbSize}`}
        style={{ width: "100%", height: "60vh", background: "#0d0a14", borderRadius: "var(--radius)", border: "1px solid var(--border)", cursor: panDrag.current ? "grabbing" : "grab" }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(2.5, Math.max(0.4, z - e.deltaY * 0.001)));
        }}
      >
        {/* Crosshair marking the exact point that will become the default view center */}
        <line x1={-15} y1={0} x2={15} y2={0} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        <line x1={0} y1={-15} x2={0} y2={15} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />

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
              {nodeLabel(n)}
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
              <td>{nodeLabel(n)}</td>
              <td>
                <select value={n.parentId ?? ""} onChange={(e) => setParent(n.id, e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— none (root) —</option>
                  {nodes
                    .filter((c) => c.id !== n.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {nodeLabel(c)}
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
