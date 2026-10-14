import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clampCam, defaultCam, focalOf, isTopView, panBy, pick, project, upsideDown, wrapAngle, type Cam } from "../lib/hullCamera";
import { pipeSegments, roomMesh, type Hull, type HullRoom } from "../lib/hullLayout";
import type { RoomState } from "../lib/chart";

/** The branch explorer: the world from hullLayout drawn as a wireframe, in the manner of a ship's scan map. One canvas, a tiny projector, no 3D library.
 *  It draws only when something changes (a drag, a key, a resize), and while you are dragging it leaves out the translucent fills, which come back when you let go. */
interface Props { hull: Hull; states: ReadonlyMap<number, RoomState>; lastSlug: string | null; playingSlug: string | null; pulses: Record<string, number>; onExit: () => void }

const EDGE: Record<RoomState, string> = { visited: "#ffb347", heard: "#8fd8ff", unseen: "rgba(100,135,165,0.55)", sealed: "#c79bff" };
const FILL: Record<RoomState, string> = { visited: "rgba(214,110,20,0.30)", heard: "rgba(60,140,200,0.14)", unseen: "rgba(0,0,0,0)", sealed: "rgba(150,90,220,0.12)" };
const FADE = [1, 0.72, 0.46];
const STATE_WORD: Record<RoomState, string> = { visited: "Visited", heard: "Heard of", unseen: "Not found yet", sealed: "Sealed" };

interface Geo { room: HullRoom; mesh: ReturnType<typeof roomMesh>; wv: Float32Array }
interface PipeGeo { from: number; to: number; seg: Float32Array; dashed: boolean; shaft: { x: number; z: number; y: number } | null; a: [number, number, number]; b: [number, number, number] }

export function BranchExplorer({ hull, states, lastSlug, playingSlug, pulses, onExit }: Props) {
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Cam>(defaultCam(hull.radius));
  const size = useRef({ w: 800, h: 600, dpr: 1 });
  const raf = useRef(0), idle = useRef<number | null>(null), interactingUntil = useRef(0);
  const anim = useRef<{ from: Cam; to: Cam; t0: number; ms: number } | null>(null);
  const hover = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const selRef = useRef<number | null>(null); selRef.current = selected;
  const [legend, setLegend] = useState(false);
  const [fs, setFs] = useState(false);

  const geo = useMemo<Geo[]>(() => hull.rooms.map((room) => {
    const mesh = roomMesh(room), wv = new Float32Array(mesh.verts.length);
    for (let i = 0; i < wv.length; i += 3) { wv[i] = mesh.verts[i] + room.x; wv[i + 1] = mesh.verts[i + 1] + room.y; wv[i + 2] = mesh.verts[i + 2] + room.z; }
    return { room, mesh, wv };
  }), [hull]);
  const pipes = useMemo<PipeGeo[]>(() => hull.links.map((l) => {
    const a = l.pts[0], b = l.pts[l.pts.length - 1];
    return { from: l.from, to: l.to, seg: new Float32Array(pipeSegments(l.pts)), dashed: l.dashed, shaft: l.shaft ? { x: l.shaft.x, z: l.shaft.z, y: (l.shaft.y0 + l.shaft.y1) / 2 } : null, a, b };
  }), [hull]);
  const byId = useMemo(() => new Map(hull.rooms.map((r) => [r.id, r])), [hull]);
  const order = useMemo(() => [...hull.rooms].sort((a, b) => a.depth - b.depth || a.angle - b.angle).map((r) => r.id), [hull]);
  const pickables = useMemo(() => hull.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y + r.h / 2, z: r.z, r: Math.max(r.w, r.d, r.h) / 2 })), [hull]);
  const stateOf = useCallback((id: number): RoomState => states.get(id) ?? "unseen", [states]);
  const lastRoom = useMemo(() => hull.rooms.find((r) => !!lastSlug && r.slug === lastSlug) ?? null, [hull, lastSlug]);
  const playRoom = useMemo(() => hull.rooms.find((r) => !!playingSlug && r.slug === playingSlug) ?? null, [hull, playingSlug]);

  // ---- drawing
  const draw = useCallback((fills: boolean) => {
    const cv = canvas.current; const ctx = cv?.getContext("2d"); if (!cv || !ctx) return;
    const { w, h, dpr } = size.current, c = cam.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const p: [number, number, number] = [0, 0, 0], f = focalOf(w, h);
    const nearZ = c.dist - hull.radius * 0.35, farZ = c.dist + hull.radius * 0.35;
    const bucket = (z: number): number => (z < nearZ ? 0 : z < farZ ? 1 : 2);
    const strokes = new Map<string, Path2D>(), fillsP = new Map<RoomState, Path2D>();
    const path = (k: string): Path2D => { let q = strokes.get(k); if (!q) { q = new Path2D(); strokes.set(k, q); } return q; };
    const linkState = (l: PipeGeo): RoomState => { const a = stateOf(l.from), b = stateOf(l.to); return l.dashed ? "sealed" : a === "visited" && b === "visited" ? "visited" : a === "unseen" && b === "unseen" ? "unseen" : "heard"; };

    // corridors
    for (const l of pipes) {
      const st = linkState(l), mid = project(c, (l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2, (l.a[2] + l.b[2]) / 2, w, h, p)[2];
      const q = path(`${st}:${bucket(mid)}:${l.dashed ? 1 : 0}`), s = l.seg, a: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < s.length; i += 6) {
        project(c, s[i], s[i + 1], s[i + 2], w, h, a); const ax = a[0], ay = a[1], az = a[2];
        project(c, s[i + 3], s[i + 4], s[i + 5], w, h, a);
        if (az > 0.5 && a[2] > 0.5) { q.moveTo(ax, ay); q.lineTo(a[0], a[1]); }
      }
    }
    // rooms
    const sx = new Float32Array(64), sy = new Float32Array(64), ok = new Uint8Array(64), labels: { r: HullRoom; x: number; y: number; rad: number }[] = [];
    for (const g of geo) {
      const r = g.room, st = stateOf(r.id), cz = project(c, r.x, r.y + r.h / 2, r.z, w, h, p)[2];
      if (cz <= 0.5) continue;
      const rad = (Math.max(r.w, r.d, r.h) / 2 * f) / cz;
      if (p[0] < -rad - 40 || p[0] > w + rad + 40 || p[1] < -rad - 40 || p[1] > h + rad + 40) continue; // off screen
      const cx = p[0], cy = p[1];
      const nv = g.wv.length / 3, q = path(`${st}:${bucket(cz)}:0`);
      for (let i = 0; i < nv; i++) { project(c, g.wv[i * 3], g.wv[i * 3 + 1], g.wv[i * 3 + 2], w, h, p); sx[i] = p[0]; sy[i] = p[1]; ok[i] = p[2] > 0.5 ? 1 : 0; }
      const e = g.mesh.edges;
      for (let i = 0; i < e.length; i += 2) if (ok[e[i]] && ok[e[i + 1]]) { q.moveTo(sx[e[i]], sy[e[i]]); q.lineTo(sx[e[i + 1]], sy[e[i + 1]]); }
      if (fills && st !== "unseen") {
        let fp = fillsP.get(st); if (!fp) { fp = new Path2D(); fillsP.set(st, fp); }
        for (const face of g.mesh.faces) { if (!face.every((i) => ok[i])) continue; fp.moveTo(sx[face[0]], sy[face[0]]); for (let k = 1; k < face.length; k++) fp.lineTo(sx[face[k]], sy[face[k]]); fp.closePath(); }
      }
      if (rad > 16 && st !== "unseen" && st !== "sealed" && labels.length < 40) labels.push({ r, x: cx, y: cy, rad });
      // busy this week (Chart layer): a blue wash on the roof
      if (fills && pulses[String(r.id)] > 0 && st !== "sealed") {
        const top = g.mesh.faces[g.mesh.faces.length - 1]; if (top.every((i) => ok[i])) {
          ctx.beginPath(); ctx.moveTo(sx[top[0]], sy[top[0]]); for (let k = 1; k < top.length; k++) ctx.lineTo(sx[top[k]], sy[top[k]]); ctx.closePath();
          ctx.fillStyle = `rgba(77,163,255,${0.12 + 0.1 * pulses[String(r.id)]})`; ctx.fill();
        }
      }
    }
    if (fills) for (const [st, fp] of fillsP) { ctx.fillStyle = FILL[st]; ctx.fill(fp); }
    ctx.lineWidth = 1; ctx.lineJoin = "round";
    for (const [k, q] of strokes) {
      const [name, b, d] = k.split(":"), st = name as RoomState;
      ctx.globalAlpha = FADE[Number(b)]; ctx.strokeStyle = EDGE[st]; ctx.setLineDash(d === "1" ? [5, 5] : []); ctx.stroke(q);
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);

    // doors where two visited rooms are joined; elevator markers where the pipe changes floor
    ctx.fillStyle = "#4cff7a";
    for (const l of pipes) if (!l.dashed && stateOf(l.from) === "visited" && stateOf(l.to) === "visited") for (const end of [l.a, l.b]) { project(c, end[0], end[1], end[2], w, h, p); if (p[2] > 0.5) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, 6.3); ctx.fill(); } }
    ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (c.dist < hull.radius * 1.5) for (const l of pipes) if (l.shaft && !l.dashed && stateOf(l.to) !== "unseen" && stateOf(l.from) !== "unseen") {
      project(c, l.shaft.x, l.shaft.y, l.shaft.z, w, h, p); if (!(p[2] > 0.5)) continue;
      ctx.strokeStyle = "#cfefff"; ctx.lineWidth = 1; ctx.strokeRect(p[0] - 6, p[1] - 6, 12, 12); ctx.fillStyle = "#cfefff"; ctx.fillText("E", p[0], p[1] + 0.5);
    }
    // where you were last: a green diamond over the room
    const diamond = (r: HullRoom, color: string, up: number) => {
      project(c, r.x, r.y + r.h + up, r.z, w, h, p); if (!(p[2] > 0.5)) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 9); ctx.lineTo(p[0] + 6, p[1]); ctx.lineTo(p[0], p[1] + 9); ctx.lineTo(p[0] - 6, p[1]); ctx.closePath(); ctx.fill();
    };
    if (lastRoom) diamond(lastRoom, "#4cff7a", 1.4);
    if (playRoom) { project(c, playRoom.x, playRoom.y + playRoom.h / 2, playRoom.z, w, h, p); if (p[2] > 0.5) { ctx.strokeStyle = "#4da3ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], (Math.max(playRoom.w, playRoom.d) * 0.8 * f) / p[2] + 5, 0, 6.3); ctx.stroke(); } }

    // the hovered and selected rooms, brighter and heavier
    const bright = (id: number | null, lw: number) => {
      if (id == null) return; const g = geo.find((x) => x.room.id === id); if (!g) return;
      const nv = g.wv.length / 3; for (let i = 0; i < nv; i++) { project(c, g.wv[i * 3], g.wv[i * 3 + 1], g.wv[i * 3 + 2], w, h, p); sx[i] = p[0]; sy[i] = p[1]; ok[i] = p[2] > 0.5 ? 1 : 0; }
      ctx.beginPath(); const e = g.mesh.edges; for (let i = 0; i < e.length; i += 2) if (ok[e[i]] && ok[e[i + 1]]) { ctx.moveTo(sx[e[i]], sy[e[i]]); ctx.lineTo(sx[e[i + 1]], sy[e[i + 1]]); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = lw; ctx.stroke();
    };
    bright(hover.current, 2); bright(selRef.current, 2.6);
    // names: close-up rooms you know, and always the hovered/selected one
    ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
    const label = (r: HullRoom, x: number, y: number, strong: boolean) => {
      const st = stateOf(r.id), text = st === "unseen" || st === "sealed" ? (st === "sealed" ? "?" : "???") : r.name.length > 20 ? r.name.slice(0, 19) + "…" : r.name;
      const tw = ctx.measureText(text).width + 10; ctx.fillStyle = "rgba(5,10,16,0.78)"; ctx.fillRect(x - tw / 2, y - 12, tw, 17);
      ctx.fillStyle = strong ? "#fff" : EDGE[st]; ctx.fillText(text, x, y + 1);
    };
    for (const l of labels) if (l.r.id !== hover.current && l.r.id !== selRef.current) label(l.r, l.x, l.y - l.rad - 6, false);
    for (const id of [hover.current, selRef.current]) if (id != null) { const r = byId.get(id); if (r) { project(c, r.x, r.y + r.h, r.z, w, h, p); if (p[2] > 0.5) label(r, p[0], p[1] - 14, true); } }

    // the compass: a disc seen at the same angle as the map, with a wedge for where you are looking
    const cx0 = w - 56, cy0 = 54, ry = 30 * Math.max(0.3, Math.sin(c.pitch + 0.2));
    ctx.fillStyle = "rgba(40,130,160,0.28)"; ctx.strokeStyle = "#5fd3ee"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx0, cy0, 32, ry, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    const a = -c.yaw - Math.PI / 2; ctx.fillStyle = "#ff9d3c"; ctx.beginPath();
    ctx.moveTo(cx0 + Math.cos(a) * 24, cy0 + Math.sin(a) * 24 * (ry / 30)); ctx.lineTo(cx0 + Math.cos(a + 2.5) * 11, cy0 + Math.sin(a + 2.5) * 11 * (ry / 30)); ctx.lineTo(cx0 + Math.cos(a - 2.5) * 11, cy0 + Math.sin(a - 2.5) * 11 * (ry / 30)); ctx.closePath(); ctx.fill();
    // numbers for tests and for anyone curious: kept on the element, not in React state
    const el = wrap.current; if (el) { el.dataset.yaw = c.yaw.toFixed(3); el.dataset.pitch = c.pitch.toFixed(3); el.dataset.dist = c.dist.toFixed(2); el.dataset.tx = c.tx.toFixed(2); el.dataset.tz = c.tz.toFixed(2); el.dataset.drawn = String(Number(el.dataset.drawn ?? 0) + 1); }
  }, [geo, pipes, byId, stateOf, lastRoom, playRoom, pulses, hull.radius]);

  const frame = useCallback(() => {
    raf.current = 0;
    const a = anim.current;
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / a.ms), k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const m = (x: number, y: number) => x + (y - x) * k;
      cam.current = { ...a.to, tx: m(a.from.tx, a.to.tx), ty: m(a.from.ty, a.to.ty), tz: m(a.from.tz, a.to.tz), dist: m(a.from.dist, a.to.dist), yaw: m(a.from.yaw, a.to.yaw), pitch: m(a.from.pitch, a.to.pitch) };
      if (t >= 1) anim.current = null;
    }
    const interacting = performance.now() < interactingUntil.current;
    draw(!interacting && !anim.current);
    if (anim.current) raf.current = requestAnimationFrame(frame);
    else if (interacting) { if (idle.current) window.clearTimeout(idle.current); idle.current = window.setTimeout(() => { idle.current = null; if (!raf.current) raf.current = requestAnimationFrame(frame); }, 200); }
  }, [draw]);
  const invalidate = useCallback((interacting = false) => {
    if (interacting) interactingUntil.current = performance.now() + 180;
    if (!raf.current) raf.current = requestAnimationFrame(frame);
  }, [frame]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); if (idle.current) window.clearTimeout(idle.current); }, []);

  const fly = useCallback((to: Partial<Cam>) => {
    const next = clampCam({ ...cam.current, ...to }, hull.radius);
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (calm) { cam.current = next; invalidate(); return; }
    // the shorter way round
    next.yaw = cam.current.yaw + wrapAngle(next.yaw - cam.current.yaw); next.pitch = cam.current.pitch + wrapAngle(next.pitch - cam.current.pitch);
    anim.current = { from: cam.current, to: next, t0: performance.now(), ms: 420 }; invalidate();
  }, [hull.radius, invalidate]);
  const focusRoom = useCallback((id: number) => { const r = byId.get(id); if (r) { setSelected(id); fly({ tx: r.x, ty: r.y + r.h / 2, tz: r.z, dist: Math.min(cam.current.dist, Math.max(16, hull.radius * 0.7)) }); } }, [byId, fly, hull.radius]);

  // ---- size
  useEffect(() => {
    const el = wrap.current, cv = canvas.current; if (!el || !cv) return;
    const fit = () => {
      const w = Math.max(200, el.clientWidth), h = Math.max(200, el.clientHeight), dpr = Math.min(window.devicePixelRatio || 1, 1.5); // a sharper canvas costs more on a weak screen: stop at 1.5
      size.current = { w, h, dpr }; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; invalidate();
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null; ro?.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, [invalidate]);

  useEffect(() => { wrap.current?.focus({ preventScroll: true }); }, []); // the keys work as soon as the map opens

  // start looking at where you were last (or the whole thing)
  useEffect(() => {
    const c = defaultCam(hull.radius);
    if (lastRoom) { c.tx = lastRoom.x; c.ty = lastRoom.y; c.tz = lastRoom.z; c.dist = Math.max(16, hull.radius * 1.2); }
    cam.current = c; invalidate();
  }, [hull, lastRoom, invalidate]);
  useEffect(() => { invalidate(); }, [states, selected, pulses, invalidate]);

  // ---- pointer: drag turns, Shift/right-drag/two fingers slide, wheel and pinch zoom, a tap picks
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; startX: number; startY: number; pan: boolean; pinch: number; mid: { x: number; y: number } } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    wrap.current?.focus({ preventScroll: true });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = local(e); ptrs.current.set(e.pointerId, pt);
    const two = [...ptrs.current.values()];
    gesture.current = { moved: 0, startX: pt.x, startY: pt.y, pan: e.button === 2 || e.shiftKey, pinch: two.length === 2 ? Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y) : 0, mid: two.length === 2 ? { x: (two[0].x + two[1].x) / 2, y: (two[0].y + two[1].y) / 2 } : pt };
  };
  const onMove = (e: React.PointerEvent) => {
    const pt = local(e), prev = ptrs.current.get(e.pointerId);
    if (!prev || !gesture.current) { // plain hover
      const { w, h } = size.current; const id = pick(cam.current, pickables, pt.x, pt.y, w, h);
      if (id !== hover.current) { hover.current = id; if (wrap.current) wrap.current.dataset.hover = id == null ? "" : String(id); wrap.current && (wrap.current.style.cursor = id == null ? "grab" : "pointer"); invalidate(); }
      return;
    }
    ptrs.current.set(e.pointerId, pt);
    const g = gesture.current, { w, h } = size.current, dx = pt.x - prev.x, dy = pt.y - prev.y;
    g.moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.current.size === 2) {
      const two = [...ptrs.current.values()], d = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y), mid = { x: (two[0].x + two[1].x) / 2, y: (two[0].y + two[1].y) / 2 };
      if (g.pinch > 0 && d > 0) cam.current = clampCam({ ...cam.current, dist: cam.current.dist * (g.pinch / d) }, hull.radius);
      cam.current = panBy(cam.current, mid.x - g.mid.x, mid.y - g.mid.y, w, h);
      g.pinch = d; g.mid = mid; anim.current = null; invalidate(true); return;
    }
    anim.current = null;
    if (g.pan) cam.current = panBy(cam.current, dx, dy, w, h);
    else cam.current = clampCam({ ...cam.current, yaw: cam.current.yaw - dx * 0.0072 * (upsideDown(cam.current) ? -1 : 1), pitch: cam.current.pitch + dy * 0.0058 }, hull.radius);
    invalidate(true);
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current, wasOne = ptrs.current.size === 1;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) gesture.current = null;
    if (g && wasOne && g.moved < 5) { const { w, h } = size.current, pt = local(e); const id = pick(cam.current, pickables, pt.x, pt.y, w, h); setSelected(id); if (id == null) invalidate(); }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); anim.current = null; cam.current = clampCam({ ...cam.current, dist: cam.current.dist * Math.exp(e.deltaY * 0.0012) }, hull.radius); invalidate(true); };
  useEffect(() => { const el = wrap.current; if (!el) return; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); }); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFs = useCallback(() => {
    const el = wrap.current?.parentElement; if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void el.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => { const on = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", on); return () => document.removeEventListener("fullscreenchange", on); }, []);

  const cycle = (dir: 1 | -1) => { if (!order.length) return; const i = selected == null ? (dir > 0 ? -1 : 0) : order.indexOf(selected); focusRoom(order[(i + dir + order.length) % order.length]); };
  // Keys are read by their place on the keyboard (e.code), not by the letter printed on them: W A S D is Z Q S D on an AZERTY board, and the map follows the board.
  const onKey = (e: React.KeyboardEvent) => {
    const c = cam.current, { w, h } = size.current; let used = true, manual = true;
    const code = e.code, key = e.key, flip = upsideDown(c) ? -1 : 1;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && key.startsWith("Arrow")) cam.current = panBy(c, key === "ArrowLeft" ? 40 : key === "ArrowRight" ? -40 : 0, key === "ArrowUp" ? 40 : key === "ArrowDown" ? -40 : 0, w, h);
    else if (key === "ArrowLeft") cam.current = clampCam({ ...c, yaw: c.yaw + 0.1 * flip }, hull.radius);
    else if (key === "ArrowRight") cam.current = clampCam({ ...c, yaw: c.yaw - 0.1 * flip }, hull.radius);
    else if (key === "ArrowUp") cam.current = clampCam({ ...c, pitch: c.pitch - 0.07 }, hull.radius);
    else if (key === "ArrowDown") cam.current = clampCam({ ...c, pitch: c.pitch + 0.07 }, hull.radius);
    else if (code === "KeyA") cam.current = panBy(c, 40, 0, w, h); else if (code === "KeyD") cam.current = panBy(c, -40, 0, w, h);
    else if (code === "KeyW") cam.current = panBy(c, 0, 40, w, h); else if (code === "KeyS") cam.current = panBy(c, 0, -40, w, h);
    else if (key === "+" || key === "=" || code === "NumpadAdd" || code === "PageUp") cam.current = clampCam({ ...c, dist: c.dist * 0.85 }, hull.radius);
    else if (key === "-" || key === "_" || code === "NumpadSubtract" || code === "PageDown") cam.current = clampCam({ ...c, dist: c.dist / 0.85 }, hull.radius);
    else if (code === "KeyT") { manual = false; fly({ pitch: isTopView(c) ? defaultCam(hull.radius).pitch : Math.PI / 2 }); }
    else if (code === "KeyR" || code === "Home") { manual = false; setSelected(null); fly(defaultCam(hull.radius)); }
    else if (code === "KeyL") { manual = false; setLegend((v) => !v); }
    else if (code === "KeyF") { manual = false; toggleFs(); }
    else if (code === "KeyE") { manual = false; cycle(1); } else if (code === "KeyQ") { manual = false; cycle(-1); }
    else if (key === "Enter" && selected != null) { const r = byId.get(selected), st = stateOf(selected); if (r && (st === "visited" || st === "heard")) window.location.assign(`/branch/${r.slug}`); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); if (manual) { anim.current = null; invalidate(true); } }
  };

  // what the keys are called on this keyboard (Chromium can tell us); everywhere else the usual names
  const [kl, setKl] = useState<Record<string, string>>({});
  useEffect(() => {
    const k = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    k?.getLayoutMap?.().then((m) => { const o: Record<string, string> = {}; for (const c of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyT", "KeyL", "KeyF"]) { const v = m.get(c); if (v) o[c] = v.toUpperCase(); } setKl(o); }).catch(() => undefined);
  }, []);
  const kn = (code: string): string => kl[code] ?? code.slice(3);

  const sel = selected != null ? byId.get(selected) ?? null : null, selState = sel ? stateOf(sel.id) : null;
  const known = hull.rooms.filter((r) => { const s = stateOf(r.id); return s === "visited" || s === "heard"; });
  const tally = { visited: 0, heard: 0, unseen: 0, sealed: 0 }; for (const r of hull.rooms) tally[stateOf(r.id)]++;
  return (
    <div className="hx" data-testid="explorer">
      <div className="hx-stage" ref={wrap} tabIndex={0} role="application" aria-label="Branch map. Arrow keys turn it, plus and minus zoom, the four keys where W A S D are on a QWERTY keyboard slide it, the keys where Q and E are go to the previous or next room, the key where T is looks from above, and the key where R is resets."
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { if (hover.current != null && ptrs.current.size === 0) { hover.current = null; invalidate(); } }} onContextMenu={(e) => e.preventDefault()} onKeyDown={onKey} data-testid="explorer-stage" data-rooms={hull.rooms.length} data-selected={selected ?? ""}>
        <canvas ref={canvas} aria-hidden="true" data-testid="explorer-canvas" />
      </div>
      <div className="hx-title"><b>Scan map</b> <span className="hx-dim" data-testid="explorer-tally">{tally.visited} visited · {tally.heard} heard of · {tally.unseen} unseen{tally.sealed > 0 ? ` · ${tally.sealed} sealed` : ""}</span></div>
      {legend && (
        <ul className="hx-legend" data-testid="explorer-legend" aria-label="Key">
          <li><i className="hx-sw hx-visited" /> Visited</li><li><i className="hx-sw hx-heard" /> Heard of</li><li><i className="hx-sw hx-unseen" /> Not found yet</li>
          <li><i className="hx-sw hx-sealed" /> Sealed room (outer ring)</li><li><i className="hx-key">E</i> Elevator: a pipe that changes floor</li>
          <li><i className="hx-dot" /> Door between two visited rooms</li><li><i className="hx-diamond" /> Where you last listened</li><li><i className="hx-ring" /> Playing now</li>
        </ul>
      )}
      {sel && selState && (
        <aside className="hx-card" data-testid="explorer-card" aria-live="polite">
          <b>{selState === "unseen" ? "???" : selState === "sealed" ? "A sealed room" : sel.name}</b>
          <span className="hx-dim">{STATE_WORD[selState]}{(selState === "visited" || selState === "heard") ? ` · ${sel.albums} album${sel.albums === 1 ? "" : "s"} · ${sel.tracks} track${sel.tracks === 1 ? "" : "s"}` : ""}</span>
          {(selState === "visited" || selState === "heard") ? (
            <span className="hx-actions"><Link className="btn" to={`/branch/${sel.slug}`} data-testid="explorer-open">Open</Link><Link className="btn" to={`/branch/${sel.slug}/room`} data-testid="explorer-room">Walk in</Link><Link className="btn" to={`/soundbay?open=${sel.slug}`} data-testid="explorer-soundbay">In Soundbay</Link></span>
          ) : <span className="hx-dim">{selState === "sealed" ? "Somewhere there is a way in." : "Walk toward it: go to a room next to it first."}</span>}
        </aside>
      )}
      <div className="hx-bar" role="toolbar" aria-label="Map controls">
        <button type="button" className="btn" onClick={onExit} data-testid="ex-exit"><kbd>Esc</kbd> Exit</button>
        <button type="button" className="btn" aria-pressed={legend} onClick={() => setLegend((v) => !v)} data-testid="ex-legend-btn"><kbd>{kn("KeyL")}</kbd> Key / legend</button>
        <span className="hx-dim hx-hints" data-testid="ex-hints"><kbd>drag</kbd> Rotate · <kbd>wheel</kbd> Zoom · <kbd>{kn("KeyW")} {kn("KeyA")} {kn("KeyS")} {kn("KeyD")}</kbd> Move</span>
        <button type="button" className="btn" onClick={() => fly({ pitch: isTopView(cam.current) ? defaultCam(hull.radius).pitch : Math.PI / 2 })} data-testid="ex-top"><kbd>{kn("KeyT")}</kbd> Top view</button>
        <button type="button" className="btn" onClick={() => { setSelected(null); fly(defaultCam(hull.radius)); }} data-testid="ex-reset"><kbd>{kn("KeyR")}</kbd> World map</button>
        <button type="button" className="btn" onClick={() => cycle(-1)} data-testid="ex-prev"><kbd>{kn("KeyQ")}</kbd> Previous room</button>
        <button type="button" className="btn" onClick={() => cycle(1)} data-testid="ex-next"><kbd>{kn("KeyE")}</kbd> Next room</button>
        <button type="button" className="btn" onClick={toggleFs} aria-pressed={fs} data-testid="ex-fs"><kbd>{kn("KeyF")}</kbd> Full screen</button>
      </div>
      <ul className="hx-sr" data-testid="explorer-list" aria-label="Rooms you know">
        {known.map((r) => <li key={r.id}><Link to={`/branch/${r.slug}`}>{r.name}</Link> ({STATE_WORD[stateOf(r.id)]})</li>)}
      </ul>
    </div>
  );
}
