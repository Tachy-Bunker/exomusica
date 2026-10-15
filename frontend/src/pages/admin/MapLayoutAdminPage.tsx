import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { clearShared } from "../../lib/sharedGet";
import { FLOOR_H, layoutHull, type HullNode, type MapOverride } from "../../lib/hullLayout";
import { Loading } from "../../components/Loading";

interface ChartNode { id: number; parentId: number | null; slug?: string; name?: string; secret?: boolean }
const SZ = 640, snap = (v: number) => Math.round(v * 2) / 2;

/** Move rooms on the explorable map: drag a dot, or type its place. Un-moved rooms stay where the automatic layout puts them. */
export function MapLayoutAdminPage() {
  const [nodes, setNodes] = useState<HullNode[] | null>(null), [ovr, setOvr] = useState<MapOverride[]>([]), [sel, setSel] = useState<string | null>(null), [msg, setMsg] = useState("");
  const cv = useRef<HTMLCanvasElement>(null), drag = useRef<string | null>(null);
  useEffect(() => {
    api<ChartNode[]>("/api/chart").then((d) => setNodes((Array.isArray(d) ? d : []).filter((n) => !n.secret && n.slug).map((n) => ({ id: n.id, parentId: n.parentId, slug: n.slug!, name: n.name ?? n.slug!, tracks: 0, albums: 0 })))).catch(() => setNodes([]));
    api<MapOverride[]>("/api/map-overrides", { cache: "no-store" }).then((r) => setOvr(Array.isArray(r) ? r : [])).catch(() => undefined);
  }, []);
  const hull = useMemo(() => (nodes ? layoutHull(nodes, { outer: false, overrides: ovr }) : null), [nodes, ovr]);
  const auto = useMemo(() => (nodes ? layoutHull(nodes, { outer: false }) : null), [nodes]);
  const scale = hull ? (SZ / 2 - 24) / Math.max(20, hull.radius) : 1, toPx = (x: number, z: number): [number, number] => [SZ / 2 + x * scale, SZ / 2 + z * scale];
  useEffect(() => {
    const c = cv.current, g = c?.getContext("2d"); if (!c || !g || !hull) return;
    g.clearRect(0, 0, SZ, SZ); g.lineWidth = 1;
    const by = new Map(hull.rooms.map((r) => [r.id, r]));
    g.strokeStyle = "rgba(255,255,255,.25)"; g.beginPath(); for (const l of hull.links) { const a = by.get(l.from), b = by.get(l.to); if (!a || !b) continue; const [x0, y0] = toPx(a.x, a.z), [x1, y1] = toPx(b.x, b.z); g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke();
    g.font = "11px sans-serif";
    for (const r of hull.rooms) {
      const [x, y] = toPx(r.x, r.z), moved = ovr.some((o) => o.slug === r.slug);
      g.fillStyle = r.slug === sel ? "#ffffff" : moved ? "#ffb347" : "#7ad7ff"; g.beginPath(); g.arc(x, y, r.slug === sel ? 7 : 5, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.8)"; g.fillText(r.name + (r.y ? ` (${Math.round(r.y / FLOOR_H)})` : ""), x + 8, y + 4);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (e: React.PointerEvent): [number, number] => { const b = cv.current!.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * SZ, py = ((e.clientY - b.top) / b.height) * SZ; return [(px - SZ / 2) / scale, (py - SZ / 2) / scale]; };
  const put = async (slug: string, o: Partial<MapOverride>) => {
    const cur = ovr.find((q) => q.slug === slug) ?? { slug, x: null, z: null, level: null }, next = { ...cur, ...o };
    setOvr((l) => [...l.filter((q) => q.slug !== slug), next].filter((q) => q.x != null || q.z != null || q.level != null));
    try { await api(`/api/admin/map-overrides/${slug}`, { method: "PUT", body: JSON.stringify({ x: next.x, z: next.z, level: next.level }) }); clearShared(); setMsg(""); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save"); }
  };
  const down = (e: React.PointerEvent) => {
    if (!hull) return; const [wx, wz] = at(e); let best: string | null = null, bd = (14 / scale) ** 2;
    for (const r of hull.rooms) { const d = (r.x - wx) ** 2 + (r.z - wz) ** 2; if (d < bd) { bd = d; best = r.slug; } }
    setSel(best); drag.current = best; if (best) cv.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => { const s = drag.current; if (!s) return; const [wx, wz] = at(e); setOvr((l) => [...l.filter((q) => q.slug !== s), { slug: s, x: snap(wx), z: snap(wz), level: l.find((q) => q.slug === s)?.level ?? null }]); };
  const up = () => { const s = drag.current; drag.current = null; if (s) { const o = ovr.find((q) => q.slug === s); if (o) void put(s, { x: o.x, z: o.z }); } };
  if (!hull || !auto) return <Loading />;
  const room = hull.rooms.find((r) => r.slug === sel) ?? null, o = ovr.find((q) => q.slug === sel);
  return (
    <div data-testid="maplayout-admin">
      <h2>Map layout</h2>
      <p className="home-dim">Drag a room to move it on the Scan map. Orange rooms are moved by you; blue ones sit where the automatic layout puts them. Doors in the 3D rooms follow.</p>
      <canvas ref={cv} data-testid="maplayout-canvas" width={SZ} height={SZ} style={{ width: "100%", maxWidth: SZ, aspectRatio: "1", background: "rgba(0,0,0,.35)", borderRadius: 8, touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {room && (
        <div data-testid="maplayout-panel" style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.6rem" }}>
          <b>{room.name}</b>
          <label>x<input data-testid="maplayout-x" type="number" step={0.5} value={o?.x ?? Math.round(room.x * 2) / 2} onChange={(e) => void put(room.slug, { x: snap(Number(e.target.value)), z: o?.z ?? snap(room.z) })} /></label>
          <label>z<input data-testid="maplayout-z" type="number" step={0.5} value={o?.z ?? Math.round(room.z * 2) / 2} onChange={(e) => void put(room.slug, { z: snap(Number(e.target.value)), x: o?.x ?? snap(room.x) })} /></label>
          <label>floor<input data-testid="maplayout-level" type="number" step={1} min={-6} max={6} value={o?.level ?? Math.round(room.y / FLOOR_H)} onChange={(e) => void put(room.slug, { level: Math.max(-6, Math.min(6, Math.round(Number(e.target.value)))) })} /></label>
          <button type="button" className="btn" data-testid="maplayout-reset" disabled={!o} onClick={() => { setOvr((l) => l.filter((q) => q.slug !== room.slug)); api(`/api/admin/map-overrides/${room.slug}`, { method: "DELETE" }).then(() => clearShared()).catch(() => setMsg("Could not reset")); }}>Back to automatic</button>
        </div>
      )}
      {msg && <p role="alert" className="home-dim">{msg}</p>}
      <p className="home-dim">{ovr.length} moved. {sel ? "" : "Pick a room."}</p>
    </div>
  );
}
