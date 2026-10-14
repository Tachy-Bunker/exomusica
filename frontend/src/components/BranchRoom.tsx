import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RoomProp, RoomWorld } from "../lib/roomWorld";
import { startDrone, stepDrone, droneWanted, setDroneWanted } from "../lib/roomDrone";
import { useAudioStore } from "../lib/audioStore";
import { applyList, glide, isVisible, joinRoom, setVisible, type Shown } from "../lib/roomNet";
import { clamp, doorWalkedInto, facing, MAX_PITCH, stepEye, wrapYaw, type Eye, type Target } from "../lib/roomView";
import { paintRoom, type DroneView } from "../lib/roomPaint";
import { isTypingTarget } from "../lib/isTypingTarget";
import { RoomStick } from "./RoomStick";

const KEYS: Record<string, [number, number, number, number]> = { // forward, strafe, turn, look
  KeyW: [1, 0, 0, 0], KeyS: [-1, 0, 0, 0], ArrowUp: [0, 0, 0, 1], ArrowDown: [0, 0, 0, -1],
  KeyA: [0, -1, 0, 0], KeyD: [0, 1, 0, 0], ArrowLeft: [0, 0, -1, 0], ArrowRight: [0, 0, 1, 0], KeyQ: [0, 0, -1, 0], KeyE: [0, 0, 1, 0],
  PageUp: [0, 0, 0, 1], PageDown: [0, 0, 0, -1],
};
const useLabel = (t: Target | null): string => (t ? t.label : "");

interface Props {
  world: RoomWorld; color: string;
  /** Go to a path (a door or a pedestal). `door` is true for a door to another room. */
  go: (to: string, door: boolean) => void;
  mapHref: string; backHref: string; onLocked: () => void;
  /** A terminal was used: the page opens its screen. */
  onProp: (p: RoomProp) => void;
  /** A terminal screen is open: the room keeps still and listens to nothing. */
  paused: boolean;
  /** The drone (the audio player) was tapped or called. */
  onDrone: () => void;
}

/** The first-person room. Input is read into refs and the canvas is only drawn while something moves or changes, so a parked room costs nothing. */
export function BranchRoom({ world, color, go, mapHref, backHref, onLocked, onProp, paused, onDrone }: Props) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), prompt = useRef<HTMLDivElement>(null), toast = useRef<HTMLDivElement>(null);
  const eye = useRef<Eye>({ ...world.spawn, pitch: 0 });
  const keys = useRef(new Set<string>()), stick = useRef({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; moved: number; type: string } | null>(null);
  const dirty = useRef(true), raf = useRef(0), last = useRef(0), traveling = useRef(false), size = useRef({ w: 0, h: 0 }), tgt = useRef<Target | null>(null), shown = useRef(""), bumped = useRef(false);
  const lookAcc = useRef({ yaw: 0, pitch: 0 }), drawn = useRef(0);
  const others = useRef(new Map<number, Shown>()), link = useRef<ReturnType<typeof joinRoom>>(null), pausedRef = useRef(paused), [visible, setVis] = useState(isVisible), [here, setHere] = useState(0);
  pausedRef.current = paused;
  const drone = useRef(startDrone({ ...world.spawn, pitch: 0 })), dview = useRef<DroneView>({ d: drone.current, playing: false, title: "", t: 0, hit: null }), lastPaint = useRef(0);
  const [droneOn, setDroneOn] = useState(droneWanted), droneOnRef = useRef(droneOn); droneOnRef.current = droneOn;
  const track = useAudioStore((s) => s.currentTrack), playing = useAudioStore((s) => s.isPlaying);
  const audioRef = useRef({ title: "", playing: false }); audioRef.current = { title: track?.title ?? "", playing };
  useEffect(() => { dirty.current = true; wakeRef.current(); }, [track?.id, playing, droneOn]);
  useEffect(() => { const on = () => setDroneOn(droneWanted()); window.addEventListener("exomusica-drone-pref", on); return () => window.removeEventListener("exomusica-drone-pref", on); }, []);

  const showToast = useCallback((s: string) => { const t = toast.current; if (!t) return; t.textContent = s; t.style.opacity = "1"; window.clearTimeout((t as unknown as { _t?: number })._t); (t as unknown as { _t?: number })._t = window.setTimeout(() => { t.style.opacity = "0"; }, 1800); }, []);

  const use = useCallback(() => {
    if (traveling.current || pausedRef.current) return;
    const t = facing(world, eye.current); if (!t) return;
    if (t.kind === "door") { if (t.door.state === "open" && t.door.toSlug) { traveling.current = true; go(`/branch/${t.door.toSlug}/room?from=${encodeURIComponent(world.slug)}`, true); } else { showToast("Sealed. You have not found that room yet."); onLocked(); } }
    else onProp(t.prop);
  }, [world, go, onLocked, onProp, showToast]);

  const turnTo = useCallback((yaw: number) => { eye.current = { ...eye.current, yaw: wrapYaw(yaw) }; dirty.current = true; wake(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = useCallback((now: number) => {
    raf.current = 0;
    const c = canvas.current, st = stage.current; if (!c || !st) return;
    const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0.016); last.current = now;
    const k = keys.current, still = pausedRef.current; let f = 0, s = 0, tr = 0, lk = 0;
    const gliding = glide(others.current, dt);
    if (!still) for (const code of k) { const v = KEYS[code]; if (v) { f += v[0]; s += v[1]; tr += v[2]; lk += v[3]; } }
    if (!still) { f += stick.current.y; s += stick.current.x; }
    const run = k.has("ShiftLeft") || k.has("ShiftRight") || Math.hypot(stick.current.x, stick.current.y) > 0.93;
    const la = lookAcc.current; lookAcc.current = { yaw: 0, pitch: 0 };
    let e = eye.current; if (la.yaw || la.pitch) e = { ...e, yaw: wrapYaw(e.yaw + la.yaw), pitch: clamp(e.pitch + la.pitch, -MAX_PITCH, MAX_PITCH) };
    const r = still ? { eye: e, into: null, moved: false } : stepEye(world, e, { forward: clamp(f, -1, 1), strafe: clamp(s, -1, 1), turn: clamp(tr, -1, 1), look: clamp(lk, -1, 1), run }, dt);
    const wantsDrone = droneOnRef.current, a = audioRef.current;
    const droneMoved = wantsDrone ? stepDrone(drone.current, r.eye, world, a.playing ? now / 1000 : 0, dt) : false;
    const animating = wantsDrone && a.playing && !document.hidden; // a playing drone breathes: repaint about 11 times a second, not 60
    const tick = animating && now - lastPaint.current >= 90;
    const changed = r.moved || !!la.yaw || !!la.pitch || gliding || droneMoved || tick; eye.current = r.eye;
    if (!traveling.current && !still) {
      const d = doorWalkedInto(world, r.eye, r.into);
      if (d?.toSlug) { traveling.current = true; go(`/branch/${d.toSlug}/room?from=${encodeURIComponent(world.slug)}`, true); }
      else if (r.into && world.doors.some((x) => x.edge === r.into!.edge && x.state === "locked" && Math.abs((r.eye.x - x.x) * x.tx + (r.eye.z - x.z) * x.tz) <= x.hw)) { if (!bumped.current) { bumped.current = true; showToast("Sealed. You have not found that room yet."); onLocked(); } }
      else if (!r.into) bumped.current = false;
    }
    if (changed || dirty.current) {
      dirty.current = false;
      const t = facing(world, r.eye); tgt.current = t;
      const label = useLabel(t); if (label !== shown.current) { shown.current = label; if (prompt.current) { prompt.current.textContent = label; prompt.current.style.opacity = label ? "1" : "0"; } }
      const w = size.current.w, h = size.current.h; if (w && h) { const ctx = c.getContext("2d"); if (ctx) { lastPaint.current = now; const dv = dview.current; dv.playing = a.playing; dv.title = a.title; dv.t = now / 1000; paintRoom(ctx, w, h, world, r.eye, color, t, [...others.current.values()], wantsDrone ? dv : null); if (!wantsDrone) dv.hit = null; } }
      link.current?.sendPose(r.eye.x, r.eye.z, r.eye.yaw);
      st.dataset.x = r.eye.x.toFixed(2); st.dataset.z = r.eye.z.toFixed(2); st.dataset.yaw = r.eye.yaw.toFixed(3); st.dataset.pitch = r.eye.pitch.toFixed(3); st.dataset.target = label; { const hh = dview.current.hit; st.dataset.drone = wantsDrone && hh ? `${Math.round(hh.x)},${Math.round(hh.y)}` : ""; } st.dataset.drawn = String(++drawn.current);
    }
    if (changed || animating || (!still && (k.size || stick.current.x || stick.current.y || drag.current))) raf.current = requestAnimationFrame(frame); else last.current = 0;
  }, [world, color, go, onLocked, showToast]);

  function wake() { if (!raf.current) raf.current = requestAnimationFrame(frame); }
  const wakeRef = useRef(wake); wakeRef.current = wake;

  // size the canvas to the stage (device pixels capped: 1.5, or 1 on small CPUs)
  useEffect(() => {
    const st = stage.current, c = canvas.current; if (!st || !c) return;
    const fit = () => {
      const w = st.clientWidth, h = st.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency ?? 8) <= 4 ? 1 : 1.5);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); size.current = { w, h };
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0); dirty.current = true; wakeRef.current();
    };
    fit(); const ro = new ResizeObserver(fit); ro.observe(st); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (pausedRef.current || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyF") { if (e.code === "Enter" && (e.target as HTMLElement)?.closest?.("a,button")) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) use(); return; }
      if (e.code === "KeyC") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) callDroneRef.current(); return; }
      if (KEYS[e.code] || e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); e.stopPropagation(); keys.current.add(e.code); wakeRef.current(); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const blur = () => { keys.current.clear(); stick.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur); cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [use]);

  useEffect(() => { if (paused) { keys.current.clear(); stick.current = { x: 0, y: 0 }; drag.current = null; } else { stage.current?.focus({ preventScroll: true }); dirty.current = true; wakeRef.current(); } }, [paused]);
  useEffect(() => {
    if (!visible) { others.current.clear(); setHere(0); dirty.current = true; wakeRef.current(); return; }
    link.current = joinRoom(world.slug, (l) => { applyList(others.current, l); setHere(l.length); dirty.current = true; wakeRef.current(); });
    dirty.current = true; wakeRef.current();
    return () => { link.current?.close(); link.current = null; others.current.clear(); };
  }, [world.slug, visible]);

  const callDroneRef = useRef(() => {});
  const callDrone = () => { if (!droneOnRef.current) { setDroneOn(true); setDroneWanted(true); } onDrone(); };
  callDroneRef.current = callDrone;
  const onStick = useCallback((x: number, y: number) => { stick.current = { x, y }; wakeRef.current(); }, []);
  const pdown = (e: React.PointerEvent) => { if (drag.current || pausedRef.current) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ } stage.current?.focus({ preventScroll: true }); };
  const pmove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    lookAcc.current.yaw += dx * 0.006; lookAcc.current.pitch -= dy * 0.004; wakeRef.current();
  };
  const pup = (e: React.PointerEvent) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; drag.current = null; if (d.moved < 6 && e.type === "pointerup") {
      const h = dview.current.hit, rc = stage.current?.getBoundingClientRect();
      if (h && rc && droneOnRef.current && Math.hypot(e.clientX - rc.left - h.x, e.clientY - rc.top - h.y) <= Math.max(30, h.r * 1.9)) { onDrone(); return; }
      if (d.type === "mouse") use();
    }
  };

  return (
    <div className="rm" data-testid="branch-room" style={{ ["--rm" as string]: color }}>
      <div ref={stage} className="rm-stage" tabIndex={0} aria-label={`${world.name}: walk with W A S D or the arrow keys, Space to use`} data-testid="room-stage" data-room={world.slug}
        onPointerDown={pdown} onPointerMove={pmove} onPointerUp={pup} onPointerCancel={pup}>
        <canvas ref={canvas} />
      </div>
      <div className="rm-scan" aria-hidden="true" />
      <div className="rm-title">{world.name}{here > 0 && <span data-testid="room-here" className="rm-here"> · {here} here</span>}</div>
      <div ref={prompt} className="rm-prompt" data-testid="room-prompt" aria-live="polite" />
      <div ref={toast} className="rm-toast" role="status" />
      <div className="rm-bar">
        <Link to={backHref} className="rm-btn" data-testid="room-back">Back</Link>
        <Link to={mapHref} className="rm-btn" data-testid="room-map">Map</Link>
        <button type="button" className="rm-btn" data-testid="room-drone" onClick={callDrone}>Drone</button>
        <button type="button" className="rm-btn" aria-pressed={visible} data-testid="room-visible" title={visible ? "Others in this room can see you. Press to hide (you will not see them either)." : "You are hidden. Press to appear."} onClick={() => { const v = !visible; setVisible(v); setVis(v); }}>{visible ? "Visible" : "Hidden"}</button>
      </div>
      <div className="rm-pad"><RoomStick onChange={onStick} /></div>
      <button type="button" className="rm-use" data-testid="room-use" onClick={() => { use(); }} onPointerDown={(e) => e.stopPropagation()}>Use</button>
      <p className="rm-hint">W A S D move · arrows look · Q E turn · Space use · C drone · Esc leave</p>
      <ul className="sr-only">
        {world.doors.map((d) => (
          <li key={d.id}>
            <button type="button" data-testid={`face-${d.id}`} onClick={() => turnTo(Math.atan2(d.z - eye.current.z, d.x - eye.current.x))}>
              {d.state === "open" ? `Face the door to ${d.name}` : "Face a sealed door"}
            </button>
          </li>
        ))}
        {world.props.map((p) => (
          <li key={p.id}>
            <button type="button" data-prop={p.id} onClick={() => { const L = Math.hypot(p.x, p.z) || 1, ux = p.x / L, uz = p.z / L; const x = p.x - ux * 1.7, z = p.z - uz * 1.7; eye.current = { x, z, yaw: wrapYaw(Math.atan2(uz, ux)), pitch: 0 }; dirty.current = true; wakeRef.current(); }}>Walk up to: {p.label}</button>
            <Link to={p.href}>{p.label} (full page)</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
