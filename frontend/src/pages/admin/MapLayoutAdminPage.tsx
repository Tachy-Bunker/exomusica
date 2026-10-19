import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { clearShared } from "../../lib/sharedGet";
import { alignedDocks, dockSnap, FLOOR_H, layoutHull, type HullNode, type MapOverride } from "../../lib/hullLayout";
import { loadMapLinks, type MapLink } from "../../lib/mapLinks";
import { loadHome, type HomeData } from "../../lib/home";
import { loadMilestones, type Milestone } from "../../lib/milestones";
import { Loading } from "../../components/Loading";

interface ChartNode { id: number; parentId: number | null; slug?: string; name?: string; secret?: boolean }
const SZ = 640, snap = (v: number) => Math.round(v * 2) / 2;

/** Move rooms on the explorable map: drag a dot, or type its place. Walls snap onto each other, and walls that meet link by themselves (auto-link). Corridors and lift destinations are added in the panel (fix406). */
export function MapLayoutAdminPage() {
  const [chart, setChart] = useState<ChartNode[] | null>(null), [home, setHome] = useState<HomeData | null>(null);
  const [ovr, setOvr] = useState<MapOverride[]>([]), [links, setLinks] = useState<MapLink[]>([]), [milestones, setMilestones] = useState<Milestone[]>([]);
  const [sel, setSel] = useState<string | null>(null), [msg, setMsg] = useState("");
  const [autoLink, setAutoLink] = useState(true), [snapWalls, setSnapWalls] = useState(true);
  const [addTo, setAddTo] = useState(""), [addKind, setAddKind] = useState<"corridor" | "lift">("corridor"), [addGate, setAddGate] = useState("");
  const cv = useRef<HTMLCanvasElement>(null), drag = useRef<string | null>(null);

  useEffect(() => {
    api<ChartNode[]>("/api/chart").then((d) => setChart(Array.isArray(d) ? d : [])).catch(() => setChart([]));
    api<MapOverride[]>("/api/map-overrides", { cache: "no-store" }).then((r) => setOvr(Array.isArray(r) ? r : [])).catch(() => undefined);
    loadHome().then(setHome).catch(() => undefined); // room sizes come from the tracks, as on the Scan map: the walls must meet where the explorer draws them
    loadMapLinks().then(setLinks).catch(() => undefined);
    loadMilestones().then(setMilestones).catch(() => undefined);
  }, []);

  const nodes = useMemo<HullNode[] | null>(() => {
    if (!chart) return null;
    const by = new Map((home?.branches ?? []).map((b) => [b.slug, b]));
    return chart.filter((n) => !n.secret && n.slug).map((n) => ({ id: n.id, parentId: n.parentId, slug: n.slug!, name: n.name ?? n.slug!, tracks: by.get(n.slug!)?.tracks ?? 0, albums: by.get(n.slug!)?.albums ?? 0 }));
  }, [chart, home]);
  const hull = useMemo(() => (nodes ? layoutHull(nodes, { outer: false, overrides: ovr, links }) : null), [nodes, ovr, links]);
  const auto = useMemo(() => (nodes ? layoutHull(nodes, { outer: false }) : null), [nodes]);
  const scale = hull ? (SZ / 2 - 24) / Math.max(20, hull.radius) : 1, toPx = (x: number, z: number): [number, number] => [SZ / 2 + x * scale, SZ / 2 + z * scale];
  const reached = useMemo(() => new Set(milestones.filter((m) => m.reached).map((m) => m.key)), [milestones]);
  const nameOf = useMemo(() => new Map((hull?.rooms ?? []).map((r) => [r.slug, r.name] as const)), [hull]);

  useEffect(() => {
    const c = cv.current, g = c?.getContext("2d"); if (!c || !g || !hull) return;
    g.clearRect(0, 0, SZ, SZ); g.lineWidth = 1;
    const by = new Map(hull.rooms.map((r) => [r.id, r])), bySlug = new Map(hull.rooms.map((r) => [r.slug, r]));
    g.strokeStyle = "rgba(255,255,255,.25)"; g.beginPath();
    for (const l of hull.links) { const a = by.get(l.from), b = by.get(l.to); if (!a || !b || (l.corridor && l.gate && !reached.has(l.gate))) continue; const [x0, y0] = toPx(a.x, a.z), [x1, y1] = toPx(b.x, b.z); g.moveTo(x0, y0); g.lineTo(x1, y1); }
    g.stroke();
    g.strokeStyle = "#ff7a7a"; g.beginPath();
    for (const l of hull.links) { const a = by.get(l.from), b = by.get(l.to); if (!a || !b || !(l.corridor && l.gate && !reached.has(l.gate))) continue; const [x0, y0] = toPx(a.x, a.z), [x1, y1] = toPx(b.x, b.z); g.moveTo(x0, y0); g.lineTo(x1, y1); }
    g.stroke();
    g.strokeStyle = "#5fd3ee"; g.setLineDash([4, 4]); g.beginPath(); // lift destinations: from the room whose cabin lists them
    for (const l of links) { if (l.kind !== "lift") continue; const a = bySlug.get(l.fromSlug), b = bySlug.get(l.toSlug); if (!a || !b) continue; const [x0, y0] = toPx(a.x, a.z), [x1, y1] = toPx(b.x, b.z); g.moveTo(x0, y0); g.lineTo(x1, y1); }
    g.stroke(); g.setLineDash([]);
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
  const reloadLinks = () => { clearShared(); loadMapLinks().then(setLinks).catch(() => undefined); };
  const hasCorridor = (a: string, b: string) => links.some((l) => l.kind === "corridor" && ((l.fromSlug === a && l.toSlug === b) || (l.fromSlug === b && l.toSlug === a)));
  const addLink = async (fromSlug: string, toSlug: string, kind: "corridor" | "lift", gate: string) => {
    try { await api("/api/admin/map-links", { method: "POST", body: JSON.stringify({ fromSlug, toSlug, kind, gate }) }); setMsg(""); reloadLinks(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not add the link"); }
  };
  const setGate = async (id: number, gate: string) => {
    try { await api(`/api/admin/map-links/${id}`, { method: "PATCH", body: JSON.stringify({ gate }) }); setMsg(""); reloadLinks(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not change the gate"); }
  };
  const removeLink = async (id: number) => {
    try { await api(`/api/admin/map-links/${id}`, { method: "DELETE" }); setMsg(""); reloadLinks(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not remove the link"); }
  };
  const down = (e: React.PointerEvent) => {
    if (!hull) return; const [wx, wz] = at(e); let best: string | null = null, bd = (14 / scale) ** 2;
    for (const r of hull.rooms) { const d = (r.x - wx) ** 2 + (r.z - wz) ** 2; if (d < bd) { bd = d; best = r.slug; } }
    setSel(best); drag.current = best; if (best) cv.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = drag.current; if (!s || !hull) return; const [wx, wz] = at(e);
    const mv = hull.rooms.find((r) => r.slug === s);
    const hit = snapWalls && mv ? dockSnap(wx, wz, mv, hull.rooms.filter((r) => r.slug !== s)) : null;
    const x = hit ? hit.x : snap(wx), z = hit ? hit.z : snap(wz);
    setOvr((l) => [...l.filter((q) => q.slug !== s), { slug: s, x, z, level: l.find((q) => q.slug === s)?.level ?? null }]);
  };
  const up = () => {
    const s = drag.current; drag.current = null; if (!s) return;
    const o = ovr.find((q) => q.slug === s); if (o) void put(s, { x: o.x, z: o.z });
    // walls that now meet, within 0.1 m, link by themselves (a corridor row, once per pair)
    const mv = hull?.rooms.find((r) => r.slug === s);
    if (autoLink && hull && mv) for (const other of hull.rooms) if (other.slug !== s && alignedDocks(mv, other) && !hasCorridor(s, other.slug)) void addLink(s, other.slug, "corridor", "");
  };
  if (!hull || !auto) return <Loading />;
  const room = hull.rooms.find((r) => r.slug === sel) ?? null, o = ovr.find((q) => q.slug === sel);
  const mine = sel ? links.filter((l) => l.fromSlug === sel || (l.kind === "corridor" && l.toSlug === sel)) : [];
  const targets = hull.rooms.filter((r) => r.slug !== sel);
  return (
    <div data-testid="maplayout-admin">
      <h2>Map layout</h2>
      <p className="home-dim">Drag a room to move it on the Scan map. Walls snap onto each other. Orange rooms are moved by you; blue ones sit where the automatic layout puts them. Doors in the 3D rooms follow.</p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <label><input data-testid="maplink-auto" type="checkbox" checked={autoLink} onChange={(e) => setAutoLink(e.target.checked)} /> Auto-link walls that meet (0.1 m)</label>
        <label><input data-testid="maplink-snap" type="checkbox" checked={snapWalls} onChange={(e) => setSnapWalls(e.target.checked)} /> Snap walls when dragging</label>
      </div>
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
      {room && (
        <section data-testid="maplink-panel" style={{ marginTop: "0.8rem" }}>
          <h3 style={{ margin: "0 0 0.4rem" }}>Links from {room.name}</h3>
          {mine.length === 0 && <p className="home-dim">No corridors or lift destinations yet. Without lift destinations, the cabin offers every open room.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.35rem" }}>
            {mine.map((l) => {
              const other = l.fromSlug === sel ? l.toSlug : l.fromSlug;
              const label = l.kind === "corridor" ? `corridor with ${nameOf.get(other) ?? other}` : `lift to ${nameOf.get(l.toSlug) ?? l.toSlug}`;
              return (
                <li key={l.id} data-testid={`maplink-row-${l.id}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ minWidth: "16rem" }}>{label}</span>
                  <select data-testid={`maplink-gate-${l.id}`} value={l.gate} onChange={(e) => void setGate(l.id, e.target.value)}>
                    <option value="">no gate</option>
                    {milestones.map((m) => <option key={m.key} value={m.key}>{m.title}{m.reached ? " (reached)" : ""}</option>)}
                  </select>
                  <button type="button" className="btn" data-testid={`maplink-delete-${l.id}`} onClick={() => void removeLink(l.id)}>Remove</button>
                </li>
              );
            })}
          </ul>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <label>to<select data-testid="maplink-target" value={addTo} onChange={(e) => setAddTo(e.target.value)}>
              <option value="">pick a room</option>
              {targets.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select></label>
            <label>kind<select data-testid="maplink-kind" value={addKind} onChange={(e) => setAddKind(e.target.value as "corridor" | "lift")}>
              <option value="corridor">corridor (both ways)</option>
              <option value="lift">lift destination (this cabin only)</option>
            </select></label>
            <label>gate<select data-testid="maplink-gate-new" value={addGate} onChange={(e) => setAddGate(e.target.value)}>
              <option value="">no gate</option>
              {milestones.map((m) => <option key={m.key} value={m.key}>{m.title}{reached.has(m.key) ? " (reached)" : ""}</option>)}
            </select></label>
            <button type="button" className="btn" data-testid="maplink-add" disabled={!addTo} onClick={() => void addLink(room.slug, addTo, addKind, addGate)}>Add link</button>
          </div>
        </section>
      )}
      {msg && <p role="alert" className="home-dim">{msg}</p>}
      <p className="home-dim">{ovr.length} moved. {links.length} links stored. {sel ? "" : "Pick a room."}</p>
    </div>
  );
}
