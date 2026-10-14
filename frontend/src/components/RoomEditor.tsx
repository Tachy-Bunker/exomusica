import { useEffect, useMemo, useRef, useState } from "react";
import { EVENTS, KINDS, MAX_ACTORS, MAX_BANDS, MAX_BANDS_PER_WALL, MAX_TEX, MAX_WIRES, MESSAGES, TEX_KINDS, cleanDoc, newId, type Actor, type Band, type Grade, type Kind, type RoomDoc, type Wire } from "../lib/roomDoc";
import { cellAt, decode, encode, floodFill, paintDisc, rectsOf } from "../lib/roomFloor";
import { onTexReady, texSheet } from "../lib/roomTextures";
import { isUpload, MAX_SKY_SPEED } from "../lib/roomDoc";
import { api } from "../lib/api";
import { drawSeams, pngOf, squareTexture } from "../lib/textureMake";
import { composeCube, panoOf, roleOf, skyUrl, type Role } from "../lib/skyMake";
import { isImageName, listZip } from "../lib/zipRead";
import type { RoomWorld } from "../lib/roomWorld";

const SNAP = 0.25, PLAN = 300;
const PALETTE = ["#7a8cff", "#ff7ab6", "#7affc8", "#ffd27a", "#c07aff", "#7ad7ff"];
const DEFAULTS: Record<Kind, Partial<Actor>> = {
  solid: { w: 2, d: 2, h: 1.5 }, ghost: { w: 2, d: 2, h: 1.5 }, trigger: { w: 3, d: 3, h: 2 }, light: { w: 1, d: 1, h: 2.4 }, marker: { w: 0.6, d: 0.6, h: 1.6 }, pool: { w: 4, d: 4, h: 0 },
};
const KIND_HELP: Record<Kind, string> = {
  solid: "Blocks you. Can be shown or hidden by wires.", ghost: "You walk through it. Cosmetic.", trigger: "A zone that sends “enter” and “exit” when you step in or out.",
  light: "A glow. Can be turned on or off.", pool: "A soft pool of light on the floor. Can swell slowly and be turned on or off.", marker: "A named point other things can listen to or send to.",
};
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Props {
  world: RoomWorld; doc: RoomDoc; onDoc: (d: RoomDoc, key?: string) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  sel: string | null; setSel: (id: string | null) => void;
  where: () => { x: number; z: number; yaw: number };
  dirty: boolean; busy: boolean; error: string; playing: boolean; onPlay: (on: boolean) => void;
  onSave: () => void; onRevert: () => void; onClose: () => void;
}

/** The room editor: a plan view of the room, a list of what is in it, and wires between things. Pure form UI, no logic of its own: every change is a new document handed up. */
export function RoomEditor({ world, doc, onDoc, onUndo, onRedo, canUndo, canRedo, sel, setSel, where, dirty, busy, error, playing, onPlay, onSave, onRevert, onClose }: Props) {
  const painting = useRef(false), cv = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: string; dx: number; dz: number } | null>(null);
  const scale = (PLAN / 2 - 8) / (world.inr + 1.5);
  const toPx = (x: number, z: number): [number, number] => [PLAN / 2 + x * scale, PLAN / 2 + z * scale];
  const fromPx = (px: number, py: number): [number, number] => [(px - PLAN / 2) / scale, (py - PLAN / 2) / scale];
  const a = doc.actors.find((x) => x.id === sel) ?? null;
  const commit = (actors: Actor[], wires: Wire[] = doc.wires) => onDoc(cleanDoc({ ...doc, actors, wires }));
  const patch = (id: string, p: Partial<Actor>) => onDoc(cleanDoc({ ...doc, actors: doc.actors.map((x) => (x.id === id ? { ...x, ...p } : x)) }), "p:" + id + Object.keys(p).join());

  // ---- floor painting
  const [tab, setTab] = useState<"things" | "floor" | "walls" | "mood">("things"), [edge, setEdge] = useState(0), [bf, setBf] = useState({ m: 1, u0: 0, u1: 100, y0: 0, y1: Math.round(world.H * 10) / 10 }), [mat, setMat] = useState(1), [tool, setTool] = useState<"brush" | "fill" | "erase" | "pick">("brush"), [size, setSize] = useState(2), [newKind, setNewKind] = useState<string>("grid");
  const floorRects = useMemo(() => rectsOf(decode(doc.floor)), [doc.floor]);
  const activeMat = doc.tex[mat - 1] ?? null;
  // ---- the picture library (admin): upload one picture or a zip of pictures
  const [lib, setLib] = useState<{ id: number; name: string; sky?: boolean }[]>([]), [skyPend, setSkyPend] = useState<HTMLCanvasElement | null>(null), [skyName, setSkyName] = useState(""), [skyMsg, setSkyMsg] = useState(""), skyPrev = useRef<HTMLCanvasElement>(null), [, bump] = useState(0), [pend, setPend] = useState<HTMLCanvasElement | null>(null), [pname, setPname] = useState(""), [libMsg, setLibMsg] = useState(""), seam = useRef<HTMLCanvasElement>(null);
  useEffect(() => onTexReady(() => bump((n) => n + 1)), []);
  const loadLib = () => { api<{ id: number; name: string; sky?: boolean }[]>("/api/admin/room-textures").then((r) => setLib(Array.isArray(r) ? r : [])).catch(() => setLibMsg("Could not load the library")); };
  useEffect(() => { if (tab === "floor" || tab === "mood") loadLib(); }, [tab]);
  useEffect(() => { if (pend && seam.current) drawSeams(seam.current, pend); }, [pend]);
  const pickFile = async (f: File | undefined) => { if (!f) return; setLibMsg(""); try { setPend(await squareTexture(f)); setPname(f.name.replace(/\.[^.]+$/, "").slice(0, 60)); } catch { setLibMsg("That file is not a picture the browser can open"); } };
  const saveTex = async () => { if (!pend) return; setLibMsg("Saving…"); try { await api("/api/admin/room-textures", { method: "POST", body: JSON.stringify({ name: pname, png: pngOf(pend) }) }); setPend(null); setLibMsg("Saved to the library"); loadLib(); } catch (e) { setLibMsg(e instanceof Error ? e.message : "Could not save"); } };
  const importZip = async (f: File | undefined) => {
    if (!f) return; setLibMsg("Reading the zip…");
    try {
      const es = listZip(new Uint8Array(await f.arrayBuffer())).filter((e) => isImageName(e.name)).slice(0, 24); let done = 0;
      for (const e of es) { try { const c = await squareTexture(new Blob([await e.data() as BlobPart])); await api("/api/admin/room-textures", { method: "POST", body: JSON.stringify({ name: e.name.split("/").pop()!.replace(/\.[^.]+$/, "").slice(0, 60), png: pngOf(c) }) }); done++; } catch { /* skip a bad entry */ } setLibMsg(`Imported ${done} of ${es.length}…`); }
      setLibMsg(es.length ? `Imported ${done} of ${es.length} pictures (shrunk to 128 px)` : "No pictures found in that zip"); loadLib();
    } catch (e) { setLibMsg(e instanceof Error ? e.message : "Could not read that zip"); }
  };
  /** Skybox files (six faces, or one wide picture) into a preview panorama. */
  const buildSky = async (files: { name: string; blob: Blob }[], title: string) => {
    setSkyMsg("Building the sky…"); setSkyPend(null);
    try {
      const bmps: { name: string; bmp: ImageBitmap }[] = []; for (const f of files.slice(0, 12)) { try { bmps.push({ name: f.name, bmp: await createImageBitmap(f.blob) }); } catch { /* not a picture */ } }
      if (!bmps.length) { setSkyMsg("No pictures found"); return; }
      const faces: Partial<Record<Role, ImageBitmap>> = {}; for (const b of bmps) { const r = roleOf(b.name); if (r && !faces[r]) faces[r] = b.bmp; }
      let c: HTMLCanvasElement;
      if (faces.front && faces.back && faces.left && faces.right) { c = composeCube(faces); setSkyMsg(faces.up && faces.down ? "Cube of 6 faces" : "Cube of 4 sides (the missing top or bottom stays dark)"); }
      else if (bmps.length === 1 || (bmps[0].bmp.width >= bmps[0].bmp.height * 1.8)) { c = panoOf(bmps[0].bmp); setSkyMsg("One wide picture"); }
      else { setSkyMsg("Name the faces front, back, left, right, up, down (or px nx py ny pz nz), or give one wide picture"); return; }
      setSkyName(title.replace(/\.[^.]+$/, "").slice(0, 60) || "sky"); setSkyPend(c);
    } catch { setSkyMsg("Could not read those files"); }
  };
  const skyFiles = (fl: FileList | null) => { if (fl && fl.length) void buildSky(Array.from(fl).map((f) => ({ name: f.name, blob: f })), fl.length === 1 ? fl[0].name : "skybox"); };
  const skyZip = async (f: File | undefined) => {
    if (!f) return; setSkyMsg("Reading the zip…");
    try { const es = listZip(new Uint8Array(await f.arrayBuffer())).filter((e) => isImageName(e.name)).slice(0, 12); const out: { name: string; blob: Blob }[] = []; for (const e of es) out.push({ name: e.name, blob: new Blob([await e.data() as BlobPart]) }); await buildSky(out, f.name); } catch (e) { setSkyMsg(e instanceof Error ? e.message : "Could not read that zip"); }
  };
  const saveSky = async () => {
    if (!skyPend) return; setSkyMsg("Saving…");
    try { const r = await api<{ id: number }>("/api/admin/room-textures", { method: "POST", body: JSON.stringify({ name: skyName, sky: true, png: skyUrl(skyPend) }) }); setSkyPend(null); setSkyMsg("Saved to the library"); loadLib(); if (r && typeof r.id === "number") onDoc(cleanDoc({ ...doc, sky: { id: r.id, speed: doc.sky?.speed ?? 0 } }), "sky"); } catch (e) { setSkyMsg(e instanceof Error ? e.message : "Could not save"); }
  };
  useEffect(() => { const c = skyPrev.current; if (c && skyPend) { const g = c.getContext("2d"); if (g) g.drawImage(skyPend, 0, 0, c.width, c.height); } }, [skyPend]);
  const delTex = async (id: number) => { try { await api(`/api/admin/room-textures/${id}`, { method: "DELETE" }); loadLib(); } catch { setLibMsg("Could not delete"); } };
  const setFloor = (cells: Uint8Array, tex = doc.tex, key = "paint") => onDoc(cleanDoc({ ...doc, tex, floor: encode(cells) }), key);
  const stroke = (px: number, py: number, first: boolean) => {
    const [x, z] = fromPx(px, py), cells = decode(doc.floor), i = cellAt(x, z); if (i < 0) return;
    if (tool === "pick") { if (cells[i]) setMat(cells[i]); return; }
    if (tool === "fill") { if (first && floodFill(cells, i, mat)) setFloor(cells, doc.tex, "fill" + performance.now()); return; }
    if (tool === "brush" && !activeMat) return;
    if (paintDisc(cells, x, z, size, tool === "erase" ? 0 : mat)) setFloor(cells);
  };
  // ---- wall bands and mood
  const bandsOn = doc.bands.filter((b) => b.e === edge);
  const addBand = () => {
    if (!doc.tex.length || doc.bands.length >= MAX_BANDS || bandsOn.length >= MAX_BANDS_PER_WALL) return;
    const b: Band = { e: edge, m: Math.min(bf.m, doc.tex.length), u0: bf.u0 / 100, u1: bf.u1 / 100, y0: bf.y0, y1: bf.y1 };
    onDoc(cleanDoc({ ...doc, bands: [...doc.bands, b] }), "band");
  };
  const grade: Grade = doc.grade ?? { tint: "#7a8cff", tintA: 0, fog: "#202040", fogD: 0 };
  const setGrade = (p: Partial<Grade>) => onDoc(cleanDoc({ ...doc, grade: { ...grade, ...p } }), "grade" + Object.keys(p).join());
  const edgeAt = (px: number, py: number): number => {
    let best = -1, bd = 14; const n = world.verts.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = toPx(world.verts[i][0], world.verts[i][1]), [bx, by] = toPx(world.verts[(i + 1) % n][0], world.verts[(i + 1) % n][1]);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)), d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const addMat = (kind = newKind) => { if (doc.tex.length >= MAX_TEX) return; onDoc(cleanDoc({ ...doc, tex: [...doc.tex, { kind, scale: 2, scroll: 0, tint: PALETTE[doc.tex.length % PALETTE.length] }] }), "mat"); setMat(doc.tex.length + 1); setTool("brush"); };
  const setTex = (p: Partial<RoomDoc["tex"][number]>) => onDoc(cleanDoc({ ...doc, tex: doc.tex.map((t, i) => (i === mat - 1 ? { ...t, ...p } : t)) }), "tex" + mat + Object.keys(p).join());
  const delMat = () => {
    if (!activeMat) return; const cells = decode(doc.floor); for (let i = 0; i < cells.length; i++) { if (cells[i] === mat) cells[i] = 0; else if (cells[i] > mat) cells[i]--; }
    setFloor(cells, doc.tex.filter((_, i) => i !== mat - 1), "delmat"); setMat(Math.max(1, mat - 1));
  };

  useEffect(() => { // the plan view
    const c = cv.current, g = c?.getContext("2d"); if (!c || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = PLAN * dpr; c.height = PLAN * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, PLAN, PLAN);
    g.beginPath(); world.verts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath();
    g.fillStyle = "rgba(255,255,255,.04)"; g.fill(); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.beginPath();
    for (let m = -Math.floor(world.inr); m <= world.inr; m++) { const [x0, y0] = toPx(m, -world.inr), [x1, y1] = toPx(m, world.inr); g.moveTo(x0, y0); g.lineTo(x1, y1); const [x2, y2] = toPx(-world.inr, m), [x3, y3] = toPx(world.inr, m); g.moveTo(x2, y2); g.lineTo(x3, y3); }
    g.stroke();
    for (const r of floorRects) { const t = doc.tex[r.t - 1]; if (!t) continue; const [x0, y0] = toPx(r.x0, r.z0), [x1, y1] = toPx(r.x1, r.z1); g.fillStyle = t.tint + "88"; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
    for (const b of doc.bands) { const t = doc.tex[b.m - 1], n = world.verts.length; if (!t) continue; const A = world.verts[b.e % n], B = world.verts[(b.e + 1) % n], [x0, y0] = toPx(A[0] + (B[0] - A[0]) * b.u0, A[1] + (B[1] - A[1]) * b.u0), [x1, y1] = toPx(A[0] + (B[0] - A[0]) * b.u1, A[1] + (B[1] - A[1]) * b.u1); g.strokeStyle = t.tint; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    if (tab === "walls") { const n = world.verts.length, A = world.verts[edge % n], B = world.verts[(edge + 1) % n], [x0, y0] = toPx(A[0], A[1]), [x1, y1] = toPx(B[0], B[1]); g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); }
    for (const d of world.doors) { const [px, py] = toPx(d.x, d.z); g.fillStyle = d.state === "open" ? "#7affc8" : "#888"; g.fillRect(px - 4, py - 4, 8, 8); }
    for (const p of world.props) { const [px, py] = toPx(p.x, p.z); g.fillStyle = "#ffd27a"; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); }
    for (const o of doc.actors) {
      const [px, py] = toPx(o.x, o.z); g.save(); g.translate(px, py); g.rotate(o.rot);
      const hw = (o.w * scale) / 2, hd = (o.d * scale) / 2;
      g.globalAlpha = o.on ? 1 : 0.4; g.fillStyle = o.color + (o.kind === "ghost" || o.kind === "trigger" ? "33" : "99"); g.strokeStyle = o.id === sel ? "#fff" : o.color; g.lineWidth = o.id === sel ? 2.5 : 1.5;
      if (o.kind === "trigger") g.setLineDash([4, 3]);
      if (o.kind === "light" || o.kind === "marker") { g.beginPath(); g.arc(0, 0, o.kind === "light" ? 5 : 4, 0, 7); g.fill(); g.stroke(); }
      else if (o.sides >= 3) { g.beginPath(); const r = Math.min(hw, hd); for (let k = 0; k < o.sides; k++) { const t = (k * Math.PI * 2) / o.sides; if (k) g.lineTo(Math.cos(t) * r, Math.sin(t) * r); else g.moveTo(Math.cos(t) * r, Math.sin(t) * r); } g.closePath(); g.fill(); g.stroke(); }
      else { g.fillRect(-hw, -hd, hw * 2, hd * 2); g.strokeRect(-hw, -hd, hw * 2, hd * 2); }
      g.restore();
    }
    const e = where(), [ex, ey] = toPx(e.x, e.z); g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, 3.5, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(e.yaw) * 12, ey + Math.sin(e.yaw) * 12); g.stroke();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (px: number, py: number): Actor | null => {
    const [x, z] = fromPx(px, py); let best: Actor | null = null, bd = Infinity;
    for (const o of doc.actors) {
      const c = Math.cos(-o.rot), s = Math.sin(-o.rot), lx = (x - o.x) * c - (z - o.z) * s, lz = (x - o.x) * s + (z - o.z) * c;
      const inside = o.kind === "light" || o.kind === "marker" ? Math.hypot(x - o.x, z - o.z) < 14 / scale : Math.abs(lx) <= o.w / 2 && Math.abs(lz) <= o.d / 2;
      const d = Math.hypot(x - o.x, z - o.z); if (inside && d < bd) { bd = d; best = o; }
    }
    return best;
  };
  const rel = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [((e.clientX - r.left) * PLAN) / r.width, ((e.clientY - r.top) * PLAN) / r.height] as const; };
  const down = (e: React.PointerEvent) => {
    if (tab === "walls") { const [wx, wy] = rel(e), k = edgeAt(wx, wy); if (k >= 0) setEdge(k); return; }
    if (tab === "mood") return;
    if (tab === "floor") { const [fx, fy] = rel(e); stroke(fx, fy, true); painting.current = true; cv.current!.setPointerCapture(e.pointerId); return; }
    const [px, py] = rel(e), o = pick(px, py); setSel(o ? o.id : null);
    if (o) { const [x, z] = fromPx(px, py); drag.current = { id: o.id, dx: o.x - x, dz: o.z - z }; cv.current!.setPointerCapture(e.pointerId); }
  };
  const move = (e: React.PointerEvent) => { if (painting.current) { const [fx, fy] = rel(e); if (tool === "brush" || tool === "erase") stroke(fx, fy, false); return; } const d = drag.current; if (!d) return; const [px, py] = rel(e), [x, z] = fromPx(px, py); patch(d.id, { x: snap(x + d.dx), z: snap(z + d.dz) }); };
  const up = () => { drag.current = null; painting.current = false; };

  const add = (kind: Kind) => {
    if (doc.actors.length >= MAX_ACTORS) return;
    const e = where(), id = newId(doc.actors.map((x) => x.id)), n = doc.actors.filter((x) => x.kind === kind).length + 1;
    const o: Actor = { id, kind, name: `${kind} ${n}`, x: snap(e.x + Math.cos(e.yaw) * 3), z: snap(e.z + Math.sin(e.yaw) * 3), w: 2, d: 2, h: 1.5, rot: 0, sides: 0, color: PALETTE[doc.actors.length % PALETTE.length], on: true, pulse: 0, ...DEFAULTS[kind] };
    commit([...doc.actors, o]); setSel(id);
  };
  const dup = () => { if (!a || doc.actors.length >= MAX_ACTORS) return; const id = newId(doc.actors.map((x) => x.id)); commit([...doc.actors, { ...a, id, name: a.name + " copy", x: a.x + 1, z: a.z + 1 }]); setSel(id); };
  const del = () => { if (!a) return; commit(doc.actors.filter((x) => x.id !== a.id), doc.wires.filter((w) => w.from !== a.id && w.to !== a.id)); setSel(null); };

  // wires
  const [wf, setWf] = useState({ ev: "", to: "", msg: "", delay: 0, once: false });
  useEffect(() => { setWf({ ev: a ? EVENTS[a.kind][0] : "", to: "", msg: "", delay: 0, once: false }); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = doc.actors.find((x) => x.id === wf.to) ?? null;
  const addWire = () => {
    if (!a || !target || !wf.ev || !wf.msg || doc.wires.length >= MAX_WIRES) return;
    commit(doc.actors, [...doc.wires, { from: a.id, ev: wf.ev, to: target.id, msg: wf.msg, delay: wf.delay, once: wf.once }]);
  };
  const nameOf = (id: string) => doc.actors.find((x) => x.id === id)?.name ?? id;
  const mine = a ? doc.wires.filter((w) => w.from === a.id || w.to === a.id) : [];
  const num = (v: string, d: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

  return (
    <aside className="re" data-testid="room-editor" aria-label="Room editor" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="re-head">
        <b>Edit room</b>
        <span className="re-sp" />
        <button type="button" className="re-b" data-testid="re-undo" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)">↶</button>
        <button type="button" className="re-b" data-testid="re-redo" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <button type="button" className="re-b" data-testid="re-play" aria-pressed={playing} onClick={() => onPlay(!playing)}>{playing ? "■ Stop test" : "▶ Test play"}</button>
        <button type="button" className="re-b" data-testid="re-close" onClick={onClose} aria-label="Close editor">✕</button>
      </div>
      <canvas ref={cv} className="re-plan" data-testid="re-plan" style={{ width: PLAN, height: PLAN }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Plan view of the room. Click a thing to select it, drag to move it." />
      <div className="re-tabs" role="tablist">
        <button type="button" role="tab" className="re-b" aria-selected={tab === "things"} data-testid="re-tab-things" onClick={() => setTab("things")}>Things</button>
        <button type="button" role="tab" className="re-b" aria-selected={tab === "floor"} data-testid="re-tab-floor" onClick={() => setTab("floor")}>Floor</button>
        <button type="button" role="tab" className="re-b" aria-selected={tab === "walls"} data-testid="re-tab-walls" onClick={() => setTab("walls")}>Walls</button>
        <button type="button" role="tab" className="re-b" aria-selected={tab === "mood"} data-testid="re-tab-mood" onClick={() => setTab("mood")}>Mood</button>
      </div>
      {tab === "floor" && (
        <div className="re-floor" data-testid="re-floor">
          <p className="re-note">Pick a material, then paint on the plan. The floor repeats the pattern.</p>
          <div className="re-row" role="group" aria-label="Tool">
            {(["brush", "fill", "erase", "pick"] as const).map((t) => <button key={t} type="button" className="re-b" data-testid={`re-tool-${t}`} aria-pressed={tool === t} onClick={() => setTool(t)}>{t === "pick" ? "pick up" : t}</button>)}
            <label className="re-inline">size<select data-testid="re-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <ul className="re-mats" aria-label="Materials">
            {doc.tex.map((t, i) => <li key={i}><button type="button" data-testid={`re-mat-${i + 1}`} aria-pressed={mat === i + 1} onClick={() => { setMat(i + 1); if (tool === "erase" || tool === "pick") setTool("brush"); }}>
              <canvas width={32} height={32} ref={(c) => { const sh = texSheet(t.kind, t.tint), g = c?.getContext("2d"); if (c && g && sh) { g.clearRect(0, 0, 32, 32); g.drawImage(sh, 0, 0, sh.width / 2, sh.width / 2, 0, 0, 32, 32); } }} />{isUpload(t.kind) ? "picture" : t.kind}</button></li>)}
          </ul>
          <div className="re-row"><select data-testid="re-newkind" value={newKind} onChange={(e) => setNewKind(e.target.value)}>{TEX_KINDS.map((k) => <option key={k}>{k}</option>)}</select><button type="button" className="re-b" data-testid="re-addmat" disabled={doc.tex.length >= MAX_TEX} onClick={() => addMat()}>+ Add material</button></div>
          {activeMat && (
            <div className="re-insp" data-testid="re-matinsp">
              <label>Pattern<select data-testid="re-kind" value={activeMat.kind} onChange={(e) => setTex({ kind: e.target.value })}>{isUpload(activeMat.kind) && <option value={activeMat.kind}>picture #{activeMat.kind.slice(1)}</option>}{TEX_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <div className="re-grid">
                <label>Metres per repeat<input data-testid="re-scale" type="number" min={0.5} max={8} step={0.25} value={activeMat.scale} onChange={(e) => setTex({ scale: num(e.target.value, activeMat.scale) })} /></label>
                <label>Flow (m/s)<input data-testid="re-scroll" type="number" min={-2} max={2} step={0.1} value={activeMat.scroll} onChange={(e) => setTex({ scroll: num(e.target.value, 0) })} /></label>
                <label>Colour<input type="color" value={activeMat.tint} onChange={(e) => setTex({ tint: e.target.value })} /></label>
              </div>
              <button type="button" className="re-b re-del" data-testid="re-delmat" onClick={delMat}>Remove material and its paint</button>
            </div>
          )}
        </div>
      )}
      {tab === "floor" && (
        <div className="re-floor" data-testid="re-library">
          <h4>Picture library</h4>
          <div className="re-row">
            <label className="re-b">Add a picture<input data-testid="re-file" type="file" accept="image/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <label className="re-b">Import a zip<input data-testid="re-zip" type="file" accept=".zip,application/zip" hidden onChange={(e) => { void importZip(e.target.files?.[0]); e.target.value = ""; }} /></label>
          </div>
          {pend && (
            <div className="re-insp" data-testid="re-seam-box">
              <canvas ref={seam} width={128} height={128} className="re-seam" data-testid="re-seam" />
              <p className="re-note">The picture repeated 2 × 2. Look for visible seams in the middle.</p>
              <label>Name<input value={pname} maxLength={60} onChange={(e) => setPname(e.target.value)} /></label>
              <div className="re-row"><button type="button" className="re-b re-save" data-testid="re-texsave" onClick={() => void saveTex()}>Save to library</button><button type="button" className="re-b" onClick={() => setPend(null)}>Cancel</button></div>
            </div>
          )}
          {libMsg && <p className="re-note" data-testid="re-libmsg">{libMsg}</p>}
          <ul className="re-mats" aria-label="Library">
            {lib.filter((t) => !t.sky).map((t) => <li key={t.id}><button type="button" data-testid={`re-lib-${t.id}`} title={`Use "${t.name}" as a material`} disabled={doc.tex.length >= MAX_TEX} onClick={() => addMat("u" + t.id)}><img src={`/api/room-textures/${t.id}`} width={32} height={32} alt="" />{t.name.slice(0, 8)}</button><button type="button" className="re-x" aria-label={`Delete ${t.name}`} data-testid={`re-libdel-${t.id}`} onClick={() => void delTex(t.id)}>✕</button></li>)}
          </ul>
        </div>
      )}
      {tab === "walls" && (
        <div className="re-floor" data-testid="re-walls">
          <p className="re-note">Click a wall on the plan to select it (dashed). Add strips of a material along it.</p>
          {!doc.tex.length ? <p className="re-empty">Add a material in the Floor tab first.</p> : (
            <div className="re-insp">
              <label>Wall {edge + 1} of {world.verts.length}: material<select data-testid="re-bmat" value={bf.m} onChange={(e) => setBf({ ...bf, m: Number(e.target.value) })}>{doc.tex.map((t, i) => <option key={i} value={i + 1}>{i + 1} · {t.kind}</option>)}</select></label>
              <div className="re-grid">
                <label>From %<input data-testid="re-bu0" type="number" min={0} max={100} step={5} value={bf.u0} onChange={(e) => setBf({ ...bf, u0: num(e.target.value, 0) })} /></label>
                <label>To %<input data-testid="re-bu1" type="number" min={0} max={100} step={5} value={bf.u1} onChange={(e) => setBf({ ...bf, u1: num(e.target.value, 100) })} /></label>
                <span />
                <label>Low (m)<input data-testid="re-by0" type="number" min={0} step={0.25} value={bf.y0} onChange={(e) => setBf({ ...bf, y0: num(e.target.value, 0) })} /></label>
                <label>High (m)<input data-testid="re-by1" type="number" min={0} step={0.25} value={bf.y1} onChange={(e) => setBf({ ...bf, y1: num(e.target.value, 2) })} /></label>
              </div>
              <div className="re-row"><button type="button" className="re-b" data-testid="re-baddwhole" onClick={() => setBf({ ...bf, u0: 0, u1: 100, y0: 0, y1: Math.round(world.H * 10) / 10 })}>Whole wall</button><button type="button" className="re-b" data-testid="re-badd" onClick={addBand}>Add strip</button></div>
            </div>
          )}
          <ul className="re-wires">
            {bandsOn.map((b, i) => <li key={i} data-testid="re-band"><span>{doc.tex[b.m - 1]?.kind} · {Math.round(b.u0 * 100)}–{Math.round(b.u1 * 100)}% · {b.y0}–{b.y1} m</span><button type="button" className="re-b" aria-label="Remove strip" onClick={() => onDoc(cleanDoc({ ...doc, bands: doc.bands.filter((x) => x !== b) }))}>✕</button></li>)}
            {!bandsOn.length && <li className="re-empty">No strips on this wall.</li>}
          </ul>
        </div>
      )}
      {tab === "mood" && (
        <div className="re-floor re-insp" data-testid="re-mood">
          <p className="re-note">One veil of colour, one band of fog, a sky (replaces the ceiling) or one material over the whole ceiling.</p>
          <div className="re-grid">
            <label>Fog colour<input type="color" data-testid="re-fogc" value={grade.fog} onChange={(e) => setGrade({ fog: e.target.value })} /></label>
            <label>Fog<input type="range" data-testid="re-fogd" min={0} max={1} step={0.05} value={grade.fogD} onChange={(e) => setGrade({ fogD: num(e.target.value, 0) })} /></label>
            <span />
            <label>Tint colour<input type="color" value={grade.tint} onChange={(e) => setGrade({ tint: e.target.value })} /></label>
            <label>Tint<input type="range" data-testid="re-tinta" min={0} max={0.4} step={0.02} value={grade.tintA} onChange={(e) => setGrade({ tintA: num(e.target.value, 0) })} /></label>
          </div>
          <div className="re-insp" data-testid="re-skybox">
            <label>Sky<select data-testid="re-sky" value={doc.sky?.id ?? 0} onChange={(e) => { const id = Number(e.target.value); onDoc(cleanDoc({ ...doc, sky: id ? { id, speed: doc.sky?.speed ?? 0 } : null }), "sky"); }}><option value={0}>none (use the ceiling)</option>{lib.filter((t) => t.sky).map((t) => <option key={t.id} value={t.id}>{t.name.replace(/^sky:/, "")}</option>)}{doc.sky && !lib.some((t) => t.id === doc.sky!.id) && <option value={doc.sky.id}>sky #{doc.sky.id}</option>}</select></label>
            {doc.sky && <label>Turning<input type="range" data-testid="re-skyspeed" min={-MAX_SKY_SPEED} max={MAX_SKY_SPEED} step={0.5} value={doc.sky.speed} onChange={(e) => onDoc(cleanDoc({ ...doc, sky: { id: doc.sky!.id, speed: Number(e.target.value) } }), "skyspeed")} /> <span className="re-note">{doc.sky.speed}°/s, wraps round</span></label>}
            <div className="re-row"><label className="re-b">Add a sky<input data-testid="re-skyfile" type="file" accept="image/*" multiple hidden onChange={(e) => { skyFiles(e.target.files); e.target.value = ""; }} /></label><label className="re-b">Import a skybox zip<input data-testid="re-skyzip" type="file" accept=".zip,application/zip" hidden onChange={(e) => { void skyZip(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
            {skyPend && <div className="re-insp"><canvas ref={skyPrev} width={256} height={128} className="re-seam" data-testid="re-skyprev" /><input data-testid="re-skyname" value={skyName} maxLength={60} onChange={(e) => setSkyName(e.target.value)} /><div className="re-row"><button type="button" className="re-b re-save" data-testid="re-skysave" onClick={() => void saveSky()}>Save to library</button><button type="button" className="re-b" onClick={() => setSkyPend(null)}>Cancel</button></div></div>}
            {skyMsg && <p className="re-note" data-testid="re-skymsg">{skyMsg}</p>}
          </div>
          <label>Ceiling<select data-testid="re-ceil" value={doc.ceil} onChange={(e) => onDoc(cleanDoc({ ...doc, ceil: Number(e.target.value) }), "ceil")}><option value={0}>none</option>{doc.tex.map((t, i) => <option key={i} value={i + 1}>{i + 1} · {isUpload(t.kind) ? "picture" : t.kind}</option>)}</select></label>
          <button type="button" className="re-b" onClick={() => onDoc(cleanDoc({ ...doc, grade: null }))}>Clear mood</button>
        </div>
      )}
      {tab === "things" && <p className="re-note">White dot: you. Drag things to move. New things appear 3 m in front of you.</p>}
      <div className="re-add" hidden={tab !== "things"} role="group" aria-label="Add">
        {KINDS.map((k) => <button key={k} type="button" className="re-b" data-testid={`re-add-${k}`} title={KIND_HELP[k]} onClick={() => add(k)}>+ {k}</button>)}
      </div>
      <ul className="re-list" aria-label="Things in this room" hidden={tab !== "things"}>
        {doc.actors.map((o) => <li key={o.id}><button type="button" data-testid={`re-item-${o.id}`} aria-pressed={o.id === sel} onClick={() => setSel(o.id)}><i style={{ background: o.color }} />{o.name}<small>{o.kind}</small></button></li>)}
        {!doc.actors.length && <li className="re-empty">Nothing here yet. Add something above.</li>}
      </ul>
      {a && tab === "things" && (
        <div className="re-insp" data-testid="re-inspector">
          <p className="re-note">{KIND_HELP[a.kind]}</p>
          <label>Name<input data-testid="re-name" value={a.name} maxLength={40} onChange={(e) => patch(a.id, { name: e.target.value })} /></label>
          <div className="re-grid">
            <label>X<input type="number" step={SNAP} value={a.x} onChange={(e) => patch(a.id, { x: num(e.target.value, a.x) })} /></label>
            <label>Z<input type="number" step={SNAP} value={a.z} onChange={(e) => patch(a.id, { z: num(e.target.value, a.z) })} /></label>
            <label>Width<input data-testid="re-w" type="number" step={SNAP} min={0.1} value={a.w} onChange={(e) => patch(a.id, { w: num(e.target.value, a.w) })} /></label>
            <label>Depth<input type="number" step={SNAP} min={0.1} value={a.d} onChange={(e) => patch(a.id, { d: num(e.target.value, a.d) })} /></label>
            <label>Height<input data-testid="re-h" type="number" step={SNAP} min={0} value={a.h} onChange={(e) => patch(a.id, { h: num(e.target.value, a.h) })} /></label>
            <label>Turn°<input type="number" step={5} value={Math.round((a.rot * 180) / Math.PI)} onChange={(e) => patch(a.id, { rot: (num(e.target.value, 0) * Math.PI) / 180 })} /></label>
          </div>
          {(a.kind === "solid" || a.kind === "ghost" || a.kind === "trigger") && (
            <label>Shape<select data-testid="re-sides" value={a.sides} onChange={(e) => patch(a.id, { sides: Number(e.target.value) })}><option value={0}>Box</option>{[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} sides</option>)}</select></label>
          )}
          {(a.kind === "light" || a.kind === "pool") && <label>Slow swell (Hz, 0 = steady)<input data-testid="re-pulse" type="number" min={0} max={2} step={0.25} value={a.pulse} onChange={(e) => patch(a.id, { pulse: num(e.target.value, 0) })} /></label>}
          <label>Colour<input type="color" value={a.color} onChange={(e) => patch(a.id, { color: e.target.value })} /></label>
          <label className="re-chk"><input type="checkbox" data-testid="re-on" checked={a.on} onChange={(e) => patch(a.id, { on: e.target.checked })} />{a.kind === "trigger" ? "Starts enabled" : "Starts visible"}</label>
          <div className="re-row"><button type="button" className="re-b" onClick={dup}>Duplicate</button><button type="button" className="re-b re-del" data-testid="re-delete" onClick={del}>Delete</button></div>

          <h4>Wires</h4>
          <ul className="re-wires">
            {mine.map((w, i) => (
              <li key={i} data-testid="re-wire">
                <span>{nameOf(w.from)} · {w.ev} → {nameOf(w.to)} · {w.msg}{w.delay ? ` after ${w.delay}s` : ""}{w.once ? " (once)" : ""}</span>
                <button type="button" className="re-b" aria-label="Remove wire" onClick={() => commit(doc.actors, doc.wires.filter((x) => x !== w))}>✕</button>
              </li>
            ))}
            {!mine.length && <li className="re-empty">No wires. Pick what happens below.</li>}
          </ul>
          <div className="re-wf">
            <label>When {a.name}<select data-testid="re-wev" value={wf.ev} onChange={(e) => setWf({ ...wf, ev: e.target.value })}>{EVENTS[a.kind].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>then tell<select data-testid="re-wto" value={wf.to} onChange={(e) => { const t = doc.actors.find((x) => x.id === e.target.value); setWf({ ...wf, to: e.target.value, msg: t ? MESSAGES[t.kind][0] : "" }); }}><option value="">pick a thing…</option>{doc.actors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label>to<select data-testid="re-wmsg" value={wf.msg} disabled={!target} onChange={(e) => setWf({ ...wf, msg: e.target.value })}>{(target ? MESSAGES[target.kind] : []).map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>after (s)<input type="number" min={0} max={600} step={0.5} value={wf.delay} onChange={(e) => setWf({ ...wf, delay: Math.max(0, num(e.target.value, 0)) })} /></label>
            <label className="re-chk"><input type="checkbox" checked={wf.once} onChange={(e) => setWf({ ...wf, once: e.target.checked })} />only once</label>
            <button type="button" className="re-b" data-testid="re-wadd" disabled={!target || !wf.msg} onClick={addWire}>Add wire</button>
          </div>
        </div>
      )}
      {error && <p className="re-err" role="alert" data-testid="re-error">{error}</p>}
      <div className="re-foot">
        <button type="button" className="re-b re-save" data-testid="re-save" disabled={busy || !dirty} onClick={onSave}>{busy ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        <button type="button" className="re-b" data-testid="re-revert" disabled={busy || !dirty} onClick={onRevert}>Undo all</button>
      </div>
    </aside>
  );
}
