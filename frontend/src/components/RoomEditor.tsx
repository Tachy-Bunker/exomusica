import { useEffect, useMemo, useRef, useState } from "react";
import { ARG_KIND, EVENTS, KINDS, SOUNDS, MAX_ACTORS, MAX_LORE, MAX_TEXT, MAX_BANDS, MAX_BANDS_PER_WALL, MAX_TEX, MAX_WIRES, MESSAGES, TEX_KINDS, cleanDoc, newId, type Actor, type Band, type Grade, type Kind, type RoomDoc, type Wire } from "../lib/roomDoc";
import { cellAt, decode, encode, floodFill, paintDisc, rectsOf } from "../lib/roomFloor";
import { onTexReady, texSheet } from "../lib/roomTextures";
import { isUpload, MAX_FLOCK, MAX_SKY_SPEED } from "../lib/roomDoc";
import { api } from "../lib/api";
import { loadMilestones, type Milestone } from "../lib/milestones";
import { PROP_BY_ID, PROP_DEFS } from "../lib/roomProps";
import { drawSeams, pngOf, squareTexture } from "../lib/textureMake";
import { composeCube, panoOf, roleOf, skyUrl, type Role } from "../lib/skyMake";
import { isImageName, listZip } from "../lib/zipRead";
import type { RoomWorld } from "../lib/roomWorld";
import { surveyDraft } from "../lib/roomLore";
import { freqOf, motifOf, voiceOf } from "../lib/roomBoss";
import { tone } from "../lib/roomSfx";
import { groupOf, makePrefab, placePrefab, prefabKey, prefabSlug } from "../lib/roomPrefab";

const SNAP = 0.25, PLAN = 300;
const PALETTE = ["#7a8cff", "#ff7ab6", "#7affc8", "#ffd27a", "#c07aff", "#7ad7ff"];
const DEFAULTS: Record<Kind, Partial<Actor>> = {
  solid: { w: 2, d: 2, h: 1.5 }, ghost: { w: 2, d: 2, h: 1.5 }, trigger: { w: 3, d: 3, h: 2 }, light: { w: 1, d: 1, h: 2.4 }, marker: { w: 0.6, d: 0.6, h: 1.6 }, pool: { w: 4, d: 4, h: 0 }, artifact: { w: 1.6, d: 0.1, h: 1 }, hazard: { w: 4, d: 4, h: 0, mode: 0, color: "#ff9a5c" }, boss: { w: 2.6, d: 2.6, h: 2.4, mode: 0, color: "#ff7ab6", text: "The Unnamed Sound" },
};
const KIND_HELP: Record<Kind, string> = {
  solid: "Blocks you. Can be shown or hidden by wires.", ghost: "You walk through it. Cosmetic.", trigger: "A zone that sends “enter” and “exit” when you step in or out.",
  light: "A glow. Can be turned on or off.", pool: "A soft pool of light on the floor. Can swell slowly and be turned on or off.", marker: "A named point other things can listen to or send to.",
  boss: "A sound you have to answer: it plays a short motif, you play it back on the pad, it changes the motif, three rounds. No health, no losing: a wrong answer just plays again. Beating it sends “defeated” (open a door, show a thing) and makes its voice yours. The seed fixes its scale, voice and body.",
  hazard: "A zone on the floor that slows you, drifts you along, or drains your integrity. Integrity refills by itself; at zero you are drawn gently back to the start of the room. Never a game-over.",
  artifact: "A panel with words and/or a picture, on a wall, on the floor or turning to face you. Can be scanned: it writes a Logbook entry and sends “scanned” (to open a door, say). Can be visible only through the scan visor.",
};
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Props {
  themeNote?: string; hasTheme?: boolean; themeMsg?: string; onTheme?: (k: "save" | "clear") => void;
  world: RoomWorld; cx?: number; cz?: number; corridor?: boolean; doc: RoomDoc; onDoc: (d: RoomDoc, key?: string) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  sel: string | null; setSel: (id: string | null) => void;
  where: () => { x: number; z: number; yaw: number };
  dirty: boolean; busy: boolean; error: string; playing: boolean; onPlay: (on: boolean) => void;
  onSave: () => void; onRevert: () => void; onClose: () => void;
}

/** The room editor: a plan view of the room, a list of what is in it, and wires between things. Pure form UI, no logic of its own: every change is a new document handed up. */
export function RoomEditor({ themeNote = "", hasTheme = false, themeMsg = "", onTheme = () => {}, world, cx = 0, cz = 0, corridor = false, doc, onDoc, onUndo, onRedo, canUndo, canRedo, sel, setSel, where, dirty, busy, error, playing, onPlay, onSave, onRevert, onClose }: Props) {
  const painting = useRef(false), cv = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: string; dx: number; dz: number } | null>(null);
  const scale = (PLAN / 2 - 8) / (world.inr + 1.5);
  const toPx = (x: number, z: number): [number, number] => [PLAN / 2 + (x - cx) * scale, PLAN / 2 + (z - cz) * scale];
  const fromPx = (px: number, py: number): [number, number] => [(px - PLAN / 2) / scale + cx, (py - PLAN / 2) / scale + cz];
  const a = doc.actors.find((x) => x.id === sel) ?? null;
  const commit = (actors: Actor[], wires: Wire[] = doc.wires) => onDoc(cleanDoc({ ...doc, actors, wires }));
  const sv = useRef<HTMLCanvasElement>(null), SIDE_H = Math.ceil(world.H * scale) + 22;
  const [miles, setMiles] = useState<Milestone[]>([]);
  useEffect(() => { let dead = false; loadMilestones().then((l) => { if (!dead) setMiles(l); }).catch(() => undefined); return () => { dead = true; }; }, []);
  const patch = (id: string, p: Partial<Actor>) => onDoc(cleanDoc({ ...doc, actors: doc.actors.map((x) => (x.id === id ? { ...x, ...p } : x)) }), "p:" + id + Object.keys(p).join());

  // ---- floor painting
  const [tab, setTab] = useState<"things" | "floor" | "walls" | "mood" | "surf">("things"), [edge, setEdge] = useState(0), [bf, setBf] = useState({ m: 1, u0: 0, u1: 100, y0: 0, y1: Math.round(world.H * 10) / 10 }), [mat, setMat] = useState(1), [tool, setTool] = useState<"brush" | "fill" | "erase" | "pick">("brush"), [size, setSize] = useState(2), [newKind, setNewKind] = useState<string>("grid");
  const floorRects = useMemo(() => rectsOf(decode(doc.floor)), [doc.floor]);
  const activeMat = doc.tex[mat - 1] ?? null;
  // ---- the picture library (admin): upload one picture or a zip of pictures
  const [lib, setLib] = useState<{ id: number; name: string; sky?: boolean }[]>([]), [skyPend, setSkyPend] = useState<HTMLCanvasElement | null>(null), [skyName, setSkyName] = useState(""), [skyMsg, setSkyMsg] = useState(""), skyPrev = useRef<HTMLCanvasElement>(null), [, bump] = useState(0), [pend, setPend] = useState<HTMLCanvasElement | null>(null), [pname, setPname] = useState(""), [libMsg, setLibMsg] = useState(""), seam = useRef<HTMLCanvasElement>(null);
  useEffect(() => onTexReady(() => bump((n) => n + 1)), []);
  const loadLib = () => { api<{ id: number; name: string; sky?: boolean }[]>("/api/admin/room-textures").then((r) => setLib(Array.isArray(r) ? r : [])).catch(() => setLibMsg("Could not load the library")); };
  useEffect(() => { if (tab === "floor" || tab === "mood" || tab === "things" || tab === "surf") loadLib(); }, [tab]);
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
  // copy / paste the look (mood, sky, specks) between rooms
  const [lookMsg, setLookMsg] = useState("");
  const copyLook = () => { try { localStorage.setItem("exomusica_look", JSON.stringify({ grade: doc.grade, sky: doc.sky, flock: doc.flock })); setLookMsg("Look copied (mood, sky and specks)."); } catch { setLookMsg("Could not copy here."); } };
  const pasteLook = () => {
    try { const c = JSON.parse(localStorage.getItem("exomusica_look") ?? "null"); if (!c) { setLookMsg("Copy a look in another room first."); return; } onDoc(cleanDoc({ ...doc, grade: c.grade, sky: c.sky, flock: c.flock }), "look"); setLookMsg("Look pasted."); } catch { setLookMsg("Could not paste."); }
  };
  const delTex = async (id: number) => { try { await api(`/api/admin/room-textures/${id}`, { method: "DELETE" }); loadLib(); } catch { setLibMsg("Could not delete"); } };
  const setFloor = (cells: Uint8Array, tex = doc.tex, key = "paint") => onDoc(cleanDoc({ ...doc, tex, floor: encode(cells) }), key);
  const stroke = (px: number, py: number, first: boolean) => {
    const [x, z] = fromPx(px, py), cells = decode(doc.floor), i = cellAt(x, z); if (i < 0) return;
    if (tool === "pick") { if (cells[i]) setMat(cells[i]); return; }
    if (tool === "fill") { if (first && floodFill(cells, i, mat)) setFloor(cells, doc.tex, "fill" + performance.now()); return; }
    if (tool === "brush" && !activeMat) return;
    // one stamp per frame would leave gaps in a fast stroke: stamp along the line from the last point, then save once
    const lp = first ? null : lastBrush.current; lastBrush.current = [x, z]; let any = false;
    if (lp) { const dist = Math.hypot(x - lp[0], z - lp[1]), n = Math.min(60, Math.ceil(dist / Math.max(0.25, size * 0.25))); for (let k = 1; k < n; k++) any = paintDisc(cells, lp[0] + ((x - lp[0]) * k) / n, lp[1] + ((z - lp[1]) * k) / n, size, tool === "erase" ? 0 : mat) || any; }
    if (paintDisc(cells, x, z, size, tool === "erase" ? 0 : mat) || any) setFloor(cells);
  };
  const lastBrush = useRef<[number, number] | null>(null);
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
    const sh = (v: number) => (v === mat ? 0 : v > mat ? v - 1 : v); // every surface that used a later material follows it down; the removed one goes plain
    onDoc(cleanDoc({ ...doc, tex: doc.tex.filter((_, i) => i !== mat - 1), floor: encode(cells), ceil: sh(doc.ceil), cfloor: sh(doc.cfloor), cwall: sh(doc.cwall), bands: doc.bands.filter((b) => b.m !== mat).map((b) => (b.m > mat ? { ...b, m: b.m - 1 } : b)) }), "delmat"); setMat(Math.max(1, mat - 1));
  };

  useEffect(() => { // the plan view
    const c = cv.current, g = c?.getContext("2d"); if (!c || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); if (c.width !== PLAN * dpr) { c.width = PLAN * dpr; c.height = PLAN * dpr; } g.setTransform(dpr, 0, 0, dpr, 0, 0); // resizing a canvas reallocates it: only when the size really changed
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
      const hw = (o.w * scale) / 2, hd = Math.max(o.kind === "artifact" ? 2 : 0, (o.d * scale) / 2);
      g.globalAlpha = o.on ? 1 : 0.4; g.fillStyle = o.color + (o.kind === "ghost" || o.kind === "trigger" ? "33" : "99"); g.strokeStyle = o.id === sel ? "#fff" : o.color; g.lineWidth = o.id === sel ? 2.5 : 1.5;
      if (o.kind === "trigger") g.setLineDash([4, 3]);
      if (o.kind === "light" || o.kind === "marker") { g.beginPath(); g.arc(0, 0, o.kind === "light" ? 5 : 4, 0, 7); g.fill(); g.stroke(); }
      else if (o.sides >= 3) { g.beginPath(); const r = Math.min(hw, hd); for (let k = 0; k < o.sides; k++) { const t = (k * Math.PI * 2) / o.sides; if (k) g.lineTo(Math.cos(t) * r, Math.sin(t) * r); else g.moveTo(Math.cos(t) * r, Math.sin(t) * r); } g.closePath(); g.fill(); g.stroke(); }
      else { g.fillRect(-hw, -hd, hw * 2, hd * 2); g.strokeRect(-hw, -hd, hw * 2, hd * 2); }
      g.restore();
    }
    const e = where(), [ex, ey] = toPx(e.x, e.z); g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, 3.5, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(e.yaw) * 12, ey + Math.sin(e.yaw) * 12); g.stroke();
    // side view: heights at the same scale as the plan, so a tall thing looks tall next to the ceiling
    const sc = sv.current, sg = sc?.getContext("2d");
    if (sc && sg) {
      const hpx = Math.ceil(world.H * scale) + 22, floorY = hpx - 8, Y = (m: number) => floorY - m * scale; if (sc.height !== hpx * dpr || sc.width !== PLAN * dpr) { sc.width = PLAN * dpr; sc.height = hpx * dpr; } sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, PLAN, hpx);
      sg.fillStyle = "rgba(255,255,255,.04)"; sg.fillRect(0, Y(world.H), PLAN, floorY - Y(world.H)); sg.strokeStyle = "rgba(255,255,255,.55)"; sg.lineWidth = 1.5; sg.beginPath(); sg.moveTo(0, floorY); sg.lineTo(PLAN, floorY); sg.moveTo(0, Y(world.H)); sg.lineTo(PLAN, Y(world.H)); sg.stroke();
      sg.setLineDash([4, 4]); sg.strokeStyle = "rgba(255,255,255,.3)"; sg.beginPath(); sg.moveTo(0, Y(1.6)); sg.lineTo(PLAN, Y(1.6)); sg.stroke(); sg.setLineDash([]);
      sg.fillStyle = "rgba(255,255,255,.7)"; sg.font = "10px sans-serif"; sg.fillText(`ceiling ${world.H} m`, 4, Y(world.H) - 3); sg.fillText("eye 1.6 m", 4, Y(1.6) - 3);
      for (const o of doc.actors) {
        const cs = Math.cos(o.rot), sn = Math.sin(o.rot), half = (Math.abs(o.w * cs) + Math.abs(o.d * sn)) / 2, [px] = toPx(o.x, o.z);
        let lo = o.lift, hi = o.lift + o.h;
        if (o.kind === "pool" || o.kind === "hazard") { lo = 0; hi = 0.05; } else if (o.kind === "light") { lo = Math.max(0, o.h - 0.1); hi = o.h + 0.1; } else if (o.kind === "marker") hi = 1.6;
        else if (o.kind === "artifact") { lo = o.mode === 1 ? 0 : 0.6; hi = o.mode === 1 ? 0.05 : 0.6 + o.h; } else if (o.prop === "drifter") { const k = Math.min(1, o.h / 1.8); lo = 0.3 * k + o.h * 0.2; hi = lo + o.h * 0.75; }
        const x0 = px - Math.max(half, 0.1) * scale, w = Math.max(3, Math.max(half, 0.1) * 2 * scale), over = hi > world.H + 0.01;
        sg.globalAlpha = o.on ? 1 : 0.4; sg.fillStyle = over ? "#ff6a6a99" : o.color + (o.kind === "ghost" || o.kind === "trigger" ? "33" : "99"); sg.strokeStyle = o.id === sel ? "#fff" : over ? "#ff6a6a" : o.color; sg.lineWidth = o.id === sel ? 2.5 : 1.2;
        sg.fillRect(x0, Y(hi), w, Math.max(2, Y(lo) - Y(hi))); sg.strokeRect(x0, Y(hi), w, Math.max(2, Y(lo) - Y(hi))); sg.globalAlpha = 1;
      }
      if (tab === "walls") for (const b of doc.bands.filter((q) => q.e === edge)) { const t = doc.tex[b.m - 1]; if (!t) continue; sg.fillStyle = t.tint + "aa"; sg.fillRect(PLAN - 10, Y(Math.min(b.y1, world.H)), 8, Math.max(2, Y(b.y0) - Y(Math.min(b.y1, world.H)))); }
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (px: number, py: number): Actor | null => {
    const [x, z] = fromPx(px, py); let best: Actor | null = null, bd = Infinity;
    for (const o of doc.actors) {
      const c = Math.cos(-o.rot), s = Math.sin(-o.rot), lx = (x - o.x) * c - (z - o.z) * s, lz = (x - o.x) * s + (z - o.z) * c;
      const inside = o.kind === "light" || o.kind === "marker" ? Math.hypot(x - o.x, z - o.z) < 14 / scale : o.kind === "artifact" ? Math.hypot(x - o.x, z - o.z) < Math.max(o.w / 2, 10 / scale) : Math.abs(lx) <= o.w / 2 && Math.abs(lz) <= o.d / 2;
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
  // pointer moves arrive faster than frames (up to 1000 a second on some mice): handle only the latest one per frame
  const pendMove = useRef<{ px: number; py: number } | null>(null), moveRaf = useRef(0);
  const doMove = (px: number, py: number) => {
    if (painting.current) { if (tool === "brush" || tool === "erase") stroke(px, py, false); return; }
    const d = drag.current; if (!d) return; const [x, z] = fromPx(px, py); patch(d.id, { x: snap(x + d.dx), z: snap(z + d.dz) });
  };
  const doMoveRef = useRef(doMove); doMoveRef.current = doMove;
  const move = (e: React.PointerEvent) => {
    if (!painting.current && !drag.current) return;
    const [px, py] = rel(e); pendMove.current = { px, py };
    if (!moveRaf.current) moveRaf.current = requestAnimationFrame(() => { moveRaf.current = 0; const m = pendMove.current; pendMove.current = null; if (m) doMoveRef.current(m.px, m.py); });
  };
  const up = () => { const m = pendMove.current; pendMove.current = null; if (m && (painting.current || drag.current)) doMoveRef.current(m.px, m.py); drag.current = null; painting.current = false; };

  const add = (kind: Kind) => {
    if (doc.actors.length >= MAX_ACTORS) return;
    const e = where(), id = newId(doc.actors.map((x) => x.id)), n = doc.actors.filter((x) => x.kind === kind).length + 1;
    const o: Actor = { id, kind, name: `${kind} ${n}`, x: snap(e.x + Math.cos(e.yaw) * 3), z: snap(e.z + Math.sin(e.yaw) * 3), w: 2, d: 2, h: 1.5, rot: 0, sides: 0, color: PALETTE[doc.actors.length % PALETTE.length], on: true, pulse: 0, text: "", lore: "", img: 0, mode: 0, visor: false, prop: "", gate: "", gateOff: false, lift: 0, pdx: 0, pdz: 0, pdy: 0, ptime: 0, pmode: 0, ...DEFAULTS[kind] };
    if (kind === "artifact") o.rot = e.yaw + Math.PI; // faces you
    if (kind === "boss") o.img = 1 + Math.floor(Math.random() * 999999);
    commit([...doc.actors, o]); setSel(id);
  };
  /** Add a catalogue prop (a solid, or a ghost for walk-through ones is not needed: frames and the like never block). */
  const addProp = (pid: string) => {
    const def = PROP_BY_ID.get(pid); if (!def || doc.actors.length >= MAX_ACTORS) return;
    const e = where(), id = newId(doc.actors.map((x) => x.id)), n = doc.actors.filter((x) => x.prop === pid).length + 1;
    const o: Actor = { id, kind: "solid", name: `${def.name} ${n}`, x: snap(e.x + Math.cos(e.yaw) * 3.5), z: snap(e.z + Math.sin(e.yaw) * 3.5), w: def.w, d: def.d, h: def.h, rot: e.yaw + Math.PI / 2, sides: def.sides, color: PALETTE[doc.actors.length % PALETTE.length], on: true, pulse: 0, text: "", lore: "", img: 0, mode: 0, visor: false, prop: pid, gate: "", gateOff: false, lift: 0, pdx: 0, pdz: 0, pdy: 0, ptime: 0, pmode: 0 };
    commit([...doc.actors, o]); setSel(id);
  };
  const dup = () => { if (!a || doc.actors.length >= MAX_ACTORS) return; const id = newId(doc.actors.map((x) => x.id)); commit([...doc.actors, { ...a, id, name: a.name + " copy", x: a.x + 1, z: a.z + 1 }]); setSel(id); };
  const del = () => { if (!a) return; commit(doc.actors.filter((x) => x.id !== a.id), doc.wires.filter((w) => w.from !== a.id && w.to !== a.id)); setSel(null); };

  // prefabs: groups of things saved on the server, placeable anywhere
  const [pfs, setPfs] = useState<string[]>([]), [pfName, setPfName] = useState(""), [pfPick, setPfPick] = useState(""), [pfMsg, setPfMsg] = useState("");
  const loadPfs = () => { api<{ slug: string }[]>("/api/admin/room-prefabs").then((r) => setPfs(Array.isArray(r) ? r.map((x) => x.slug) : [])).catch(() => setPfMsg("Could not load the prefabs")); };
  useEffect(() => { if (tab === "things") loadPfs(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const savePf = async (whole: boolean) => {
    const slug = prefabSlug(pfName || (a?.name ?? "")); if (!slug) { setPfMsg("Give it a name first."); return; }
    const ids = whole ? new Set(doc.actors.map((x) => x.id)) : a ? groupOf(doc, a.id) : new Set<string>();
    if (!ids.size) { setPfMsg(whole ? "The room is empty." : "Pick a thing first."); return; }
    setPfMsg("Saving…");
    try {
      const cur = await api<{ version: number }>(`/api/room-doc/${prefabKey(slug)}`, { cache: "no-store" }).catch(() => ({ version: 0 }));
      await api(`/api/admin/room-doc/${prefabKey(slug)}`, { method: "PUT", body: JSON.stringify({ doc: makePrefab(doc, ids), baseVersion: cur.version }) });
      setPfMsg(`Saved “${slug}” (${ids.size} thing${ids.size === 1 ? "" : "s"}).`); setPfPick(slug); loadPfs();
    } catch (e) { setPfMsg(e instanceof Error ? e.message : "Could not save"); }
  };
  const putPf = async () => {
    if (!pfPick) return; setPfMsg("Placing…");
    try {
      const r = await api<{ doc: RoomDoc }>(`/api/room-doc/${prefabKey(pfPick)}`, { cache: "no-store" }), e = where();
      const out = placePrefab(doc, cleanDoc(r.doc), snap(e.x + Math.cos(e.yaw) * 4), snap(e.z + Math.sin(e.yaw) * 4));
      if (!out.added.length) { setPfMsg("No room for it: the room is full."); return; }
      commit(out.actors, out.wires); setSel(out.added[0]); setPfMsg(`Placed ${out.added.length} thing${out.added.length === 1 ? "" : "s"} in front of you.`);
    } catch (er) { setPfMsg(er instanceof Error ? er.message : "Could not place"); }
  };
  const delPf = async () => { if (!pfPick) return; try { await api(`/api/admin/room-doc/${prefabKey(pfPick)}`, { method: "DELETE" }); setPfMsg(`Deleted “${pfPick}”.`); setPfPick(""); loadPfs(); } catch (er) { setPfMsg(er instanceof Error ? er.message : "Could not delete"); } };
  // wires
  const [wf, setWf] = useState({ ev: "", to: "", msg: "", delay: 0, once: false, arg: "" });
  useEffect(() => { setWf({ ev: a ? EVENTS[a.kind][0] : "", to: "", msg: "", delay: 0, once: false, arg: "" }); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = doc.actors.find((x) => x.id === wf.to) ?? null;
  const addWire = () => {
    const ev = a && EVENTS[a.kind].includes(wf.ev) ? wf.ev : a ? EVENTS[a.kind][0] : ""; // the select shows its first event when the state is empty or left over from another thing (a fast pick after a selection change)
    if (!a || !target || !ev || !wf.msg || doc.wires.length >= MAX_WIRES) return;
    commit(doc.actors, [...doc.wires, { from: a.id, ev, to: target.id, msg: wf.msg, delay: wf.delay, once: wf.once, ...(ARG_KIND[wf.msg] ? { arg: wf.arg } : {}) }]);
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
      <canvas ref={sv} className="re-plan re-side" data-testid="re-side" width={PLAN} height={SIDE_H} style={{ width: PLAN, height: SIDE_H }} aria-label={`Side view: the room is ${world.H} metres high`} />
      <div className="re-tabs" role="tablist">
        <button type="button" role="tab" className="re-b" aria-selected={tab === "things"} data-testid="re-tab-things" onClick={() => setTab("things")}>Things</button>
        {!corridor && <button type="button" role="tab" className="re-b" aria-selected={tab === "floor"} data-testid="re-tab-floor" onClick={() => setTab("floor")}>Floor</button>}
        {!corridor && <button type="button" role="tab" className="re-b" aria-selected={tab === "walls"} data-testid="re-tab-walls" onClick={() => setTab("walls")}>Walls</button>}
        {corridor && <button type="button" role="tab" className="re-b" aria-selected={tab === "surf"} data-testid="re-tab-surf" onClick={() => setTab("surf")}>Surfaces</button>}
        <button type="button" role="tab" className="re-b" aria-selected={tab === "mood"} data-testid="re-tab-mood" onClick={() => setTab("mood")}>Mood</button>
      </div>
      {(tab === "floor" || tab === "surf") && (
        <div className="re-floor" data-testid="re-floor">
          {tab === "surf" && <div className="re-insp" data-testid="re-surf">
            <p className="re-note">Make materials below (pick a pattern or a picture), then choose which one covers each surface of this corridor.</p>
            {([["cfloor", "Floor"], ["cwall", "Walls"], ["ceil", "Ceiling"]] as const).map(([k, label]) => <label key={k}>{label}<select data-testid={`re-surf-${k}`} value={doc[k]} onChange={(e) => onDoc(cleanDoc({ ...doc, [k]: Number(e.target.value) }), k)}><option value={0}>plain</option>{doc.tex.map((t, i) => <option key={i} value={i + 1}>{i + 1} · {isUpload(t.kind) ? `picture #${t.kind.slice(1)}` : t.kind}</option>)}</select></label>)}
          </div>}
          {tab === "floor" && <p className="re-note">Pick a material, then paint on the plan. The floor repeats the pattern.</p>}
          {tab === "floor" && <div className="re-row" role="group" aria-label="Tool">
            {(["brush", "fill", "erase", "pick"] as const).map((t) => <button key={t} type="button" className="re-b" data-testid={`re-tool-${t}`} aria-pressed={tool === t} onClick={() => setTool(t)}>{t === "pick" ? "pick up" : t}</button>)}
            <label className="re-inline">size<select data-testid="re-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>}
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
      {(tab === "floor" || tab === "surf") && (
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
                <label>High (m)<input data-testid="re-by1" type="number" min={0} max={world.H} step={0.25} value={bf.y1} onChange={(e) => setBf({ ...bf, y1: Math.min(world.H, num(e.target.value, 2)) })} /></label>
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
          {!corridor && <div className="re-insp" data-testid="re-look">
            <div className="re-row"><button type="button" className="re-b" data-testid="re-prime" title="Amber veil, dark brown fog, drifting embers, heavy wall dressing, light shafts" onClick={() => onDoc(cleanDoc({ ...doc, grade: { tint: "#ff9a4a", tintA: 0.12, fog: "#2a1408", fogD: 0.45 }, flock: { kind: 1, n: 8, color: "#ff8a3c" }, dress: 3, shafts: 0.6 }), "prime")}>Warm industrial</button></div>
            <div className="re-grid">
              <label>Wall dressing<select data-testid="re-dress" value={doc.dress} onChange={(e) => onDoc(cleanDoc({ ...doc, dress: Number(e.target.value) }), "dress")}><option value={0}>None</option><option value={1}>Light</option><option value={2}>Normal</option><option value={3}>Heavy</option></select></label>
              <label>Light shafts<input type="range" data-testid="re-shafts" min={0} max={1} step={0.1} value={doc.shafts} onChange={(e) => onDoc(cleanDoc({ ...doc, shafts: num(e.target.value, 0) }), "shafts")} /></label>
            </div>
          </div>}
          <div className="re-grid">
            <label>Fog colour<input type="color" data-testid="re-fogc" value={grade.fog} onChange={(e) => setGrade({ fog: e.target.value })} /></label>
            <label>Fog<input type="range" data-testid="re-fogd" min={0} max={1} step={0.05} value={grade.fogD} onChange={(e) => setGrade({ fogD: num(e.target.value, 0) })} /></label>
            <span />
            <label>Tint colour<input type="color" value={grade.tint} onChange={(e) => setGrade({ tint: e.target.value })} /></label>
            <label>Tint<input type="range" data-testid="re-tinta" min={0} max={0.4} step={0.02} value={grade.tintA} onChange={(e) => setGrade({ tintA: num(e.target.value, 0) })} /></label>
          </div>
          {!corridor && <>
          <div className="re-insp" data-testid="re-flockbox">
            <label>Drifting specks<select data-testid="re-flock" value={doc.flock ? doc.flock.kind : -1} onChange={(e) => { const v = Number(e.target.value); onDoc(cleanDoc({ ...doc, flock: v < 0 ? null : { kind: v, n: doc.flock?.n ?? 8, color: doc.flock?.color ?? (v ? "#c8ff7a" : "#ffe9a8") } }), "flock"); }}><option value={-1}>none</option><option value={0}>dust</option><option value={1}>fireflies</option></select></label>
            {doc.flock && <div className="re-grid"><label>How many<input type="range" data-testid="re-flockn" min={1} max={MAX_FLOCK} step={1} value={doc.flock.n} onChange={(e) => onDoc(cleanDoc({ ...doc, flock: { ...doc.flock!, n: Number(e.target.value) } }), "flockn")} /></label><label>Colour<input type="color" data-testid="re-flockc" value={doc.flock.color} onChange={(e) => onDoc(cleanDoc({ ...doc, flock: { ...doc.flock!, color: e.target.value } }), "flockc")} /></label></div>}
            <p className="re-note">At most {MAX_FLOCK}. They drift through walls, fade and come back elsewhere, only drawn when in view, and switch off on slow devices.</p>
          </div>
          <div className="re-insp" data-testid="re-skybox">
            <label>Sky<select data-testid="re-sky" value={doc.sky?.id ?? 0} onChange={(e) => { const id = Number(e.target.value); onDoc(cleanDoc({ ...doc, sky: id ? { id, speed: doc.sky?.speed ?? 0 } : null }), "sky"); }}><option value={0}>none (use the ceiling)</option>{lib.filter((t) => t.sky).map((t) => <option key={t.id} value={t.id}>{t.name.replace(/^sky:/, "")}</option>)}{doc.sky && !lib.some((t) => t.id === doc.sky!.id) && <option value={doc.sky.id}>sky #{doc.sky.id}</option>}</select></label>
            {doc.sky && <label>Turning<input type="range" data-testid="re-skyspeed" min={-MAX_SKY_SPEED} max={MAX_SKY_SPEED} step={0.5} value={doc.sky.speed} onChange={(e) => onDoc(cleanDoc({ ...doc, sky: { id: doc.sky!.id, speed: Number(e.target.value) } }), "skyspeed")} /> <span className="re-note">{doc.sky.speed}°/s, wraps round</span></label>}
            <div className="re-row"><label className="re-b">Add a sky<input data-testid="re-skyfile" type="file" accept="image/*" multiple hidden onChange={(e) => { skyFiles(e.target.files); e.target.value = ""; }} /></label><label className="re-b">Import a skybox zip<input data-testid="re-skyzip" type="file" accept=".zip,application/zip" hidden onChange={(e) => { void skyZip(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
            {skyPend && <div className="re-insp"><canvas ref={skyPrev} width={256} height={128} className="re-seam" data-testid="re-skyprev" /><input data-testid="re-skyname" value={skyName} maxLength={60} onChange={(e) => setSkyName(e.target.value)} /><div className="re-row"><button type="button" className="re-b re-save" data-testid="re-skysave" onClick={() => void saveSky()}>Save to library</button><button type="button" className="re-b" onClick={() => setSkyPend(null)}>Cancel</button></div></div>}
            {skyMsg && <p className="re-note" data-testid="re-skymsg">{skyMsg}</p>}
          </div>
          <label>Ceiling<select data-testid="re-ceil" value={doc.ceil} onChange={(e) => onDoc(cleanDoc({ ...doc, ceil: Number(e.target.value) }), "ceil")}><option value={0}>none</option>{doc.tex.map((t, i) => <option key={i} value={i + 1}>{i + 1} · {isUpload(t.kind) ? "picture" : t.kind}</option>)}</select></label>
          </>}
          {!corridor && (
            <div className="re-insp" data-testid="re-theme">
              <label className="re-chk"><input type="checkbox" data-testid="re-inherit" checked={doc.inherit} onChange={(e) => onDoc(cleanDoc({ ...doc, inherit: e.target.checked }), "inherit")} />Use the theme of the branches above</label>
              <p className="re-note" data-testid="re-themenote">{doc.inherit ? themeNote : "Ignoring every theme."} What this room sets itself always wins.</p>
              <div className="re-row"><button type="button" className="re-b" data-testid="re-themesave" onClick={() => onTheme("save")}>Make this look the theme of this branch and below</button><button type="button" className="re-b" data-testid="re-themeclear" disabled={!hasTheme} onClick={() => onTheme("clear")}>Remove this branch's theme</button></div>
              <div className="re-row"><button type="button" className="re-b" data-testid="re-copylook" onClick={copyLook}>Copy look</button><button type="button" className="re-b" data-testid="re-pastelook" onClick={pasteLook}>Paste look</button></div>
              {(themeMsg || lookMsg) && <p className="re-note" data-testid="re-thememsg">{lookMsg || themeMsg}</p>}
            </div>
          )}
          <button type="button" className="re-b" onClick={() => onDoc(cleanDoc({ ...doc, grade: null }))}>Clear mood</button>
        </div>
      )}
      {tab === "things" && <p className="re-note">White dot: you. Drag things to move. New things appear 3 m in front of you.</p>}
      {tab === "things" && (
        <div className="re-insp" data-testid="re-prefabs">
          <b>Prefabs</b>
          <div className="re-row"><input data-testid="re-pfname" placeholder="name" maxLength={40} value={pfName} onChange={(e) => setPfName(e.target.value)} /><button type="button" className="re-b" data-testid="re-pfsave" disabled={!a} title="Saves the picked thing and everything wired to it" onClick={() => savePf(false)}>Save picked + wired</button><button type="button" className="re-b" data-testid="re-pfsaveall" onClick={() => savePf(true)}>Save whole room</button></div>
          <div className="re-row"><select data-testid="re-pfpick" value={pfPick} onChange={(e) => setPfPick(e.target.value)}><option value="">pick a prefab…</option>{pfs.map((n) => <option key={n}>{n}</option>)}</select><button type="button" className="re-b" data-testid="re-pfput" disabled={!pfPick} onClick={putPf}>Place</button><button type="button" className="re-b re-del" data-testid="re-pfdel" disabled={!pfPick} onClick={delPf}>Delete</button></div>
          {pfMsg && <p className="re-note" data-testid="re-pfmsg">{pfMsg}</p>}
        </div>
      )}
      {tab === "things" && !corridor && !a && (
        <div className="re-insp" data-testid="re-log">
          <label>Logbook entry for this room<textarea data-testid="re-logtext" rows={4} maxLength={MAX_LORE} placeholder="Written into the player's Logbook once they have explored the room. Empty: made from the branch description." value={doc.log} onChange={(e) => onDoc(cleanDoc({ ...doc, log: e.target.value }), "log")} /></label>
          <div className="re-row"><button type="button" className="re-b" data-testid="re-logdraft" onClick={() => onDoc(cleanDoc({ ...doc, log: surveyDraft(world.name, world.blurb) }), "log")}>Draft from the branch description</button></div>
        </div>
      )}
      <div className="re-add" hidden={tab !== "things"} role="group" aria-label="Add">
        {KINDS.map((k) => <button key={k} type="button" className="re-b" data-testid={`re-add-${k}`} title={KIND_HELP[k]} onClick={() => add(k)}>+ {k}</button>)}
        <select className="re-b" data-testid="re-add-prop" value="" aria-label="Add a prop" title="Black-hole debris and ruins" onChange={(e) => { if (e.target.value) addProp(e.target.value); }}><option value="">+ prop…</option>{PROP_DEFS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
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
            {(a.kind === "solid" || a.kind === "ghost") && <label>Raised by (m)<input data-testid="re-lift" type="number" step={SNAP} min={0} max={12} value={a.lift} title="Height of its underside above the floor. 0 = on the floor. Over 1.7 you can walk under it; a flat top up to 0.5 m you step onto, higher you jump (J) or take stairs and ramps." onChange={(e) => patch(a.id, { lift: Math.max(0, Math.min(12, num(e.target.value, a.lift))) })} /></label>}
            {(a.kind === "solid" || a.kind === "ghost") && (
              <div className="re-insp" data-testid="re-path">
                <b>Travels (back and forth, smoothly)</b>
                <div className="re-row">
                  <label>Sideways (m)<input data-testid="re-pdx" type="number" step={SNAP} min={-40} max={40} value={a.pdx} onChange={(e) => patch(a.id, { pdx: num(e.target.value, a.pdx), ptime: a.ptime || 6 })} /></label>
                  <label>Forward (m)<input data-testid="re-pdz" type="number" step={SNAP} min={-40} max={40} value={a.pdz} onChange={(e) => patch(a.id, { pdz: num(e.target.value, a.pdz), ptime: a.ptime || 6 })} /></label>
                  <label>Up (m)<input data-testid="re-pdy" type="number" step={SNAP} min={-10} max={10} value={a.pdy} onChange={(e) => patch(a.id, { pdy: num(e.target.value, a.pdy), ptime: a.ptime || 6 })} /></label>
                  <label>Seconds one way<input data-testid="re-ptime" type="number" step={1} min={1} max={120} value={a.ptime || ""} placeholder="still" onChange={(e) => patch(a.id, { ptime: Math.max(0, Math.min(120, num(e.target.value, 0))) })} /></label>
                </div>
                <label>It moves<select data-testid="re-pmode" value={a.pmode} onChange={(e) => patch(a.id, { pmode: Number(e.target.value) })}><option value={0}>all the time</option><option value={1}>only when called (a wire sends “move”: it goes, the next call brings it back)</option></select></label>
                <p className="re-note">Directions are relative to the room, not to the turn of the thing. Everyone sees it in the same place at the same time. It does not carry you along.</p>
              </div>
            )}
            <label>Turn°<input type="number" step={5} value={Math.round((a.rot * 180) / Math.PI)} onChange={(e) => patch(a.id, { rot: (num(e.target.value, 0) * Math.PI) / 180 })} /></label>
          </div>
          {(a.kind === "solid" || a.kind === "ghost") && (
            <label>Prop<select data-testid="re-prop" value={a.prop} onChange={(e) => { const d = PROP_BY_ID.get(e.target.value); patch(a.id, d ? { prop: d.id, w: d.w, d: d.d, h: d.h, sides: d.sides } : { prop: "" }); }}><option value="">plain box / prism</option>{PROP_DEFS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          )}
          {a.prop && <p className="re-note" data-testid="re-propnote">{PROP_BY_ID.get(a.prop)?.blurb} Width, depth, height, turn and colour reshape it.</p>}
          {(a.kind === "trigger" || ((a.kind === "solid" || a.kind === "ghost") && !a.prop)) && (
            <label>Shape<select data-testid="re-sides" value={a.sides} onChange={(e) => patch(a.id, { sides: Number(e.target.value) })}><option value={0}>Box</option>{[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} sides</option>)}</select></label>
          )}
          {a.kind === "hazard" && <label>Effect<select data-testid="re-hmode" value={a.mode} onChange={(e) => patch(a.id, { mode: Number(e.target.value) })}><option value={0}>Slows you</option><option value={1}>Drifts you along (Turn° sets the direction)</option><option value={2}>Drains integrity</option></select></label>}
          {(a.kind === "light" || a.kind === "pool" || a.kind === "hazard") && <label>Slow swell (Hz, 0 = steady)<input data-testid="re-pulse" type="number" min={0} max={2} step={0.25} value={a.pulse} onChange={(e) => patch(a.id, { pulse: num(e.target.value, 0) })} /></label>}
          {a.kind === "boss" && (
            <div className="re-insp" data-testid="re-boss">
              <label>Name<input data-testid="re-bossname" maxLength={MAX_TEXT} value={a.text} onChange={(e) => patch(a.id, { text: e.target.value })} /></label>
              <div className="re-row"><label>Seed<input data-testid="re-bossseed" type="number" min={0} max={999999999} step={1} value={a.img} onChange={(e) => patch(a.id, { img: Math.max(0, Math.round(num(e.target.value, a.img))) })} /></label><button type="button" className="re-b" data-testid="re-bossroll" onClick={() => patch(a.id, { img: 1 + Math.floor(Math.random() * 999999) })}>New seed</button><button type="button" className="re-b" data-testid="re-bosslisten" onClick={() => { const v = voiceOf(a.img, a.mode); motifOf(a.img, a.mode, 0).forEach((d, i) => tone(freqOf(v, d), 0.7, v.partials, i * 0.55, 0.1)); }}>Hear round 1</button></div>
              <label>Length of the motif<select data-testid="re-bossdiff" value={a.mode} onChange={(e) => patch(a.id, { mode: Number(e.target.value) })}><option value={0}>3 notes</option><option value={1}>4 notes</option><option value={2}>5 notes</option></select></label>
              <label>Logbook entry when answered<textarea data-testid="re-bosslore" rows={3} maxLength={MAX_LORE} value={a.lore} onChange={(e) => patch(a.id, { lore: e.target.value })} /></label>
              <p className="re-note">The seed fixes its scale, voice, body and motifs: the same for everyone. Walk up to it in play and press Use.</p>
            </div>
          )}
          {a.kind === "artifact" && (
            <div className="re-insp" data-testid="re-artifact">
              <label>Words on it<input data-testid="re-atext" value={a.text} maxLength={MAX_TEXT} onChange={(e) => patch(a.id, { text: e.target.value })} /></label>
              <label>Picture<select data-testid="re-aimg" value={a.img} onChange={(e) => patch(a.id, { img: Number(e.target.value) })}><option value={0}>none</option>{lib.filter((t) => !t.sky).map((t) => <option key={t.id} value={t.id}>{t.name.slice(0, 24)}</option>)}{a.img > 0 && !lib.some((t) => t.id === a.img) && <option value={a.img}>picture #{a.img}</option>}</select></label>
              <label>Placement<select data-testid="re-amode" value={a.mode} onChange={(e) => patch(a.id, { mode: Number(e.target.value) })}><option value={0}>On a wall (fixed, turn it with Turn°)</option><option value={1}>On the floor</option><option value={2}>Billboard (faces you)</option></select></label>
              <label className="re-chk"><input type="checkbox" data-testid="re-avisor" checked={a.visor} onChange={(e) => patch(a.id, { visor: e.target.checked })} />Only visible through the scan visor</label>
              <label>Logbook entry (what scanning it writes)<textarea data-testid="re-alore" rows={5} maxLength={MAX_LORE} value={a.lore} onChange={(e) => patch(a.id, { lore: e.target.value })} /></label>
              <p className="re-note">{a.lore.length}/{MAX_LORE}. Width and Height size the panel; wall panels hang 0.6 m up.</p>
            </div>
          )}
          <div className="re-insp" data-testid="re-gate">
            <label>Appears when the community reaches<select data-testid="re-gatesel" value={a.gate} onChange={(e) => patch(a.id, { gate: e.target.value, gateOff: e.target.value ? a.gateOff : false })}><option value="">always there</option>{miles.map((m) => <option key={m.key} value={m.key}>{m.title} ({m.target} {m.label.toLowerCase()})</option>)}{a.gate && !miles.some((m) => m.key === a.gate) && <option value={a.gate}>{a.gate}</option>}</select></label>
            {a.gate && <label className="re-chk"><input type="checkbox" data-testid="re-gateoff" checked={a.gateOff} onChange={(e) => patch(a.id, { gateOff: e.target.checked })} />Reverse: it is there only until that is reached</label>}
            {a.gate && <p className="re-note">Here in the editor you always see it. Visitors see it {a.gateOff ? "until" : "once"} “{miles.find((m) => m.key === a.gate)?.title ?? a.gate}” {a.gateOff ? "is reached" : "is reached"}. Pair a “there until” thing with a “there once” thing to swap one for the other.</p>}
          </div>
          <label>Colour<input type="color" value={a.color} onChange={(e) => patch(a.id, { color: e.target.value })} /></label>
          <label className="re-chk"><input type="checkbox" data-testid="re-on" checked={a.on} onChange={(e) => patch(a.id, { on: e.target.checked })} />{a.kind === "trigger" ? "Starts enabled" : "Starts visible"}</label>
          <div className="re-row"><button type="button" className="re-b" onClick={dup}>Duplicate</button><button type="button" className="re-b re-del" data-testid="re-delete" onClick={del}>Delete</button></div>

          <h4>Wires</h4>
          <ul className="re-wires">
            {mine.map((w, i) => (
              <li key={i} data-testid="re-wire">
                <span>{nameOf(w.from)} · {w.ev} → {nameOf(w.to)} · {w.msg}{w.arg ? ` “${w.arg}”` : ""}{w.delay ? ` after ${w.delay}s` : ""}{w.once ? " (once)" : ""}</span>
                <button type="button" className="re-b" aria-label="Remove wire" onClick={() => commit(doc.actors, doc.wires.filter((x) => x !== w))}>✕</button>
              </li>
            ))}
            {!mine.length && <li className="re-empty">No wires. Pick what happens below.</li>}
          </ul>
          <div className="re-wf">
            <label>When {a.name}<select data-testid="re-wev" value={wf.ev} onChange={(e) => setWf({ ...wf, ev: e.target.value })}>{EVENTS[a.kind].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>then tell<select data-testid="re-wto" value={wf.to} onChange={(e) => { const t = doc.actors.find((x) => x.id === e.target.value); setWf({ ...wf, to: e.target.value, msg: t ? MESSAGES[t.kind][0] : "", arg: "" }); }}><option value="">pick a thing…</option>{doc.actors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label>to<select data-testid="re-wmsg" value={wf.msg} disabled={!target} onChange={(e) => setWf({ ...wf, msg: e.target.value, arg: e.target.value === "setcolor" ? "#ff7ab6" : e.target.value === "play" ? SOUNDS[0] : e.target.value === "shot" ? "4" : "" })}>{(target ? MESSAGES[target.kind] : []).map((v) => <option key={v}>{v}</option>)}</select></label>
            {ARG_KIND[wf.msg] === "color" && <label>colour<input data-testid="re-warg" type="color" value={wf.arg || "#ff7ab6"} onChange={(e) => setWf({ ...wf, arg: e.target.value })} /></label>}
            {ARG_KIND[wf.msg] === "sound" && <label>sound<select data-testid="re-warg" value={wf.arg} onChange={(e) => setWf({ ...wf, arg: e.target.value })}>{SOUNDS.map((v) => <option key={v}>{v}</option>)}</select></label>}
            {ARG_KIND[wf.msg] === "secs" && <label>seconds<input data-testid="re-warg" type="number" min={1} max={20} step={1} value={wf.arg} onChange={(e) => setWf({ ...wf, arg: e.target.value })} /></label>}
            {ARG_KIND[wf.msg] === "text" && <label>line<input data-testid="re-warg" maxLength={80} value={wf.arg} onChange={(e) => setWf({ ...wf, arg: e.target.value })} /></label>}
            <label>after (s)<input type="number" min={0} max={600} step={0.5} value={wf.delay} onChange={(e) => setWf({ ...wf, delay: Math.max(0, num(e.target.value, 0)) })} /></label>
            <label className="re-chk"><input type="checkbox" checked={wf.once} onChange={(e) => setWf({ ...wf, once: e.target.checked })} />only once</label>
            <button type="button" className="re-b" data-testid="re-wadd" disabled={!target || !wf.msg || (!!ARG_KIND[wf.msg] && !wf.arg.trim())} onClick={addWire}>Add wire</button>
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
