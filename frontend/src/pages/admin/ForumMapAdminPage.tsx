import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface MapNode {
  id: number;
  type: "TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS" | "PLAYLIST" | "SAMPLE_BANK_ITEM" | "CHALLENGE";
  parentId: number | null;
  x: number;
  y: number;
  color: string | null;
  size: number | null;
  hidden: boolean;
  channel: { slug: string; name: string } | null;
  playlist: { slug: string; title: string; owner: { username: string } } | null;
  sampleBankItem: { id: number; title: string; owner: { username: string } } | null;
  challenge: { id: number; title: string } | null;
}

interface ChannelOption {
  slug: string;
  name: string;
  id: number;
  branchId: number | null;
}
interface RefOption {
  id: number;
  label: string;
}

function nodeLabel(n: MapNode): string {
  if (n.type === "PLAYLIST" && n.playlist) return `[Playlist] ${n.playlist.title} — ${n.playlist.owner.username}`;
  if (n.type === "SAMPLE_BANK_ITEM" && n.sampleBankItem) return `[Sample] ${n.sampleBankItem.title} — ${n.sampleBankItem.owner.username}`;
  if (n.type === "CHALLENGE" && n.challenge) return `[Challenge] ${n.challenge.title}`;
  const name = n.channel?.name ?? "";
  if (n.type === "ACTIVE_BRANCHES") return `[Active] ${name}`;
  if (n.type === "GROWING_SEEDS") return `[Growing] ${name}`;
  return name;
}

export function ForumMapAdminPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [newType, setNewType] = useState<"TOPIC" | "ACTIVE_BRANCHES" | "GROWING_SEEDS" | "PLAYLIST" | "SAMPLE_BANK_ITEM" | "CHALLENGE">("TOPIC");
  const [playlistOptions, setPlaylistOptions] = useState<RefOption[]>([]);
  const [sampleOptions, setSampleOptions] = useState<RefOption[]>([]);
  const [challengeOptions, setChallengeOptions] = useState<RefOption[]>([]);
  const [newRefId, setNewRefId] = useState<number | "">("");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [navSpeed, setNavSpeed] = useState(1);
  const [fireflySize, setFireflySize] = useState(1);
  const [fireflySpeed, setFireflySpeed] = useState(1);
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
    api<{ id: number; title: string; owner: string }[]>("/api/playlists").then((list) =>
      setPlaylistOptions(list.map((p) => ({ id: p.id, label: `${p.title} — ${p.owner}` }))),
    );
    api<{ id: number; title: string; owner: string }[]>("/api/sample-bank").then((list) =>
      setSampleOptions(list.map((s) => ({ id: s.id, label: `${s.title} — ${s.owner}` }))),
    );
    api<{ id: number; title: string }[]>("/api/challenges").then((list) => setChallengeOptions(list.map((c) => ({ id: c.id, label: c.title }))));
  }, []);
  useEffect(() => {
    api<{ forumMapInitialX: number; forumMapInitialY: number; forumMapInitialZoom: number; forumMapNavSpeed: number; forumMapFireflySize: number; forumMapFireflySpeed: number }>("/api/site-settings").then((s) => {
      setPan({ x: s.forumMapInitialX ?? 0, y: s.forumMapInitialY ?? 0 });
      setZoom(s.forumMapInitialZoom ?? 1);
      setNavSpeed(s.forumMapNavSpeed ?? 1);
      setFireflySize(s.forumMapFireflySize ?? 1);
      setFireflySpeed(s.forumMapFireflySpeed ?? 1);
    });
  }, []);

  const usedChannelIds = new Set(nodes.map((n) => n.channel?.slug));
  const availableChannels = channels.filter((c) => !usedChannelIds.has(c.slug));

  async function addNode() {
    if (!newRefId) return;
    const refField =
      newType === "PLAYLIST" ? "playlistId" : newType === "SAMPLE_BANK_ITEM" ? "sampleBankItemId" : newType === "CHALLENGE" ? "challengeId" : "channelId";
    await api("/api/admin/forum-map/nodes", {
      method: "POST",
      body: JSON.stringify({ type: newType, [refField]: newRefId, x: -pan.x, y: -pan.y }),
    });
    setNewRefId("");
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

  async function setNodeStyle(id: number, patch: { color?: string | null; size?: number | null }) {
    await api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    load();
  }

  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<number>>(new Set());

  function toggleNodeSelected(id: number) {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyColor(hex: string) {
    setCopiedColor(hex);
    navigator.clipboard?.writeText(hex).catch(() => {});
  }

  async function pasteColorToSelected() {
    if (!copiedColor || selectedNodeIds.size === 0) return;
    await Promise.all(
      [...selectedNodeIds].map((id) => api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify({ color: copiedColor }) })),
    );
    load();
  }

  async function toggleHidden(id: number, hidden: boolean) {
    await api(`/api/admin/forum-map/nodes/${id}`, { method: "PATCH", body: JSON.stringify({ hidden }) });
    load();
  }

  async function saveDefaultView() {
    await api("/api/admin/site-settings", {
      method: "PATCH",
      body: JSON.stringify({
        forumMapInitialX: pan.x,
        forumMapInitialY: pan.y,
        forumMapInitialZoom: zoom,
        forumMapNavSpeed: navSpeed,
        forumMapFireflySize: fireflySize,
        forumMapFireflySpeed: fireflySpeed,
      }),
    });
    alert("Saved. This is now the view, navigation speed, and firefly appearance visitors get when opening the map.");
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
          <select
            value={newType}
            onChange={(e) => {
              setNewType(e.target.value as typeof newType);
              setNewRefId("");
            }}
          >
            <option value="TOPIC">Topic</option>
            <option value="ACTIVE_BRANCHES">Active Branch (styled)</option>
            <option value="GROWING_SEEDS">Growing Seed (styled)</option>
            <option value="PLAYLIST">Playlist</option>
            <option value="SAMPLE_BANK_ITEM">Sample Bank item</option>
            <option value="CHALLENGE">Challenge</option>
          </select>
        </div>
        {newType === "PLAYLIST" || newType === "SAMPLE_BANK_ITEM" || newType === "CHALLENGE" ? (
          <div>
            <label>{newType === "PLAYLIST" ? "Playlist" : newType === "SAMPLE_BANK_ITEM" ? "Sample" : "Challenge"}</label>
            <select value={newRefId} onChange={(e) => setNewRefId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— select —</option>
              {(newType === "PLAYLIST" ? playlistOptions : newType === "SAMPLE_BANK_ITEM" ? sampleOptions : challengeOptions).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label>Channel</label>
            <select value={newRefId} onChange={(e) => setNewRefId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— select —</option>
              {availableChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.branchId ? `[Branch] ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-primary" onClick={addNode}>
          Add node
        </button>
        <div>
          <label>Nav speed</label>
          <input type="number" min={0.1} max={5} step={0.1} value={navSpeed} onChange={(e) => setNavSpeed(Number(e.target.value))} style={{ width: 55 }} />
        </div>
        <div>
          <label>Firefly size</label>
          <input type="number" min={0.2} max={3} step={0.1} value={fireflySize} onChange={(e) => setFireflySize(Number(e.target.value))} style={{ width: 55 }} />
        </div>
        <div>
          <label>Firefly speed</label>
          <input type="number" min={0} max={4} step={0.1} value={fireflySpeed} onChange={(e) => setFireflySpeed(Number(e.target.value))} style={{ width: 55 }} />
        </div>
        <button className="btn" onClick={saveDefaultView} title="Save the current pan/zoom and nav speed as what visitors get when they first open the map">
          Set current view as default
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${-vbSize / 2 - pan.x} ${-vbSize / 2 - pan.y} ${vbSize} ${vbSize}`}
        style={{ width: "100%", height: "60vh", background: "#0d0a14", borderRadius: "var(--radius)", border: "1px solid var(--border)", cursor: panDrag.current ? "grabbing" : "grab", userSelect: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          onBackgroundPointerDown(e);
        }}
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
              r={n.size ?? (n.type === "TOPIC" ? 14 : 18)}
              fill={n.color ?? (n.type === "TOPIC" ? "#8fd3ff" : n.type === "ACTIVE_BRANCHES" ? "#a7ffc9" : "#c9a7ff")}
              opacity={0.85}
            />
            <text y={n.type === "TOPIC" ? 30 : 38} textAnchor="middle" fill="#fff" fontSize={11}>
              {nodeLabel(n)}
            </text>
          </g>
        ))}
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0.6rem 0" }}>
        {copiedColor && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
            Copied:
            <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 3, background: copiedColor, border: "1px solid var(--border)" }} />
            {copiedColor}
          </span>
        )}
        <button className="btn btn-primary" onClick={pasteColorToSelected} disabled={!copiedColor || selectedNodeIds.size === 0}>
          Paste color to selected ({selectedNodeIds.size})
        </button>
        {selectedNodeIds.size > 0 && (
          <button className="btn" onClick={() => setSelectedNodeIds(new Set())}>
            Clear selection
          </button>
        )}
      </div>

      <table style={{ width: "100%", marginTop: "1rem", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th />
            <th style={{ textAlign: "left" }}>Node</th>
            <th style={{ textAlign: "left" }}>Parent</th>
            <th style={{ textAlign: "left" }}>Color</th>
            <th style={{ textAlign: "left" }}>Size</th>
            <th style={{ textAlign: "left" }}>Hidden</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>
                <input type="checkbox" checked={selectedNodeIds.has(n.id)} onChange={() => toggleNodeSelected(n.id)} />
              </td>
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
                <input
                  type="color"
                  value={n.color ?? (n.type === "TOPIC" ? "#e2703f" : n.type === "ACTIVE_BRANCHES" ? "#f0a06a" : "#4fa8e0")}
                  onChange={(e) => setNodeStyle(n.id, { color: e.target.value })}
                  style={{ width: 32, height: 24, padding: 0 }}
                />
                <button
                  className="btn"
                  style={{ fontSize: "0.65rem", marginLeft: "0.2rem", padding: "0.1rem 0.3rem" }}
                  onClick={() => copyColor(n.color ?? (n.type === "TOPIC" ? "#e2703f" : n.type === "ACTIVE_BRANCHES" ? "#f0a06a" : "#4fa8e0"))}
                  title="Copy this hex color"
                >
                  copy
                </button>
                {n.color && (
                  <button className="btn" style={{ fontSize: "0.65rem", marginLeft: "0.2rem", padding: "0.1rem 0.3rem" }} onClick={() => setNodeStyle(n.id, { color: null })} title="Reset to default color">
                    reset
                  </button>
                )}
              </td>
              <td>
                <input
                  type="number"
                  min={4}
                  max={60}
                  value={n.size ?? (n.type === "TOPIC" ? 14 : 19)}
                  onChange={(e) => setNodeStyle(n.id, { size: Number(e.target.value) })}
                  style={{ width: 55 }}
                />
              </td>
              <td>
                <input type="checkbox" checked={n.hidden} onChange={(e) => toggleHidden(n.id, e.target.checked)} title="Hide by default — parent shows a reveal handle instead" />
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
