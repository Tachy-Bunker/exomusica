import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { RoomWorld } from "../lib/roomWorld";
import { clamp, doorWalkedInto, facing, MAX_PITCH, stepEye, wrapYaw, type Eye, type Target } from "../lib/roomView";
import { paintRoom } from "../lib/roomPaint";
import { isTypingTarget } from "../lib/isTypingTarget";
import { RoomStick } from "./RoomStick";

const KEYS: Record<string, [number, number, number, number]> = { // forward, strafe, turn, look
  KeyW: [1, 0, 0, 0], ArrowUp: [1, 0, 0, 0], KeyS: [-1, 0, 0, 0], ArrowDown: [-1, 0, 0, 0],
  KeyA: [0, -1, 0, 0], KeyD: [0, 1, 0, 0], ArrowLeft: [0, 0, -1, 0], ArrowRight: [0, 0, 1, 0], KeyQ: [0, 0, -1, 0], KeyE: [0, 0, 1, 0],
  PageUp: [0, 0, 0, 1], PageDown: [0, 0, 0, -1],
};
const useLabel = (t: Target | null): string => (t ? t.label : "");

interface Props {
  world: RoomWorld; color: string;
  /** Go to a path (a door or a pedestal). `door` is true for a door to another room. */
  go: (to: string, door: boolean) => void;
  mapHref: string; backHref: string; onLocked: () => void;
}

/** The first-person room. Input is read into refs and the canvas is only drawn while something moves or changes, so a parked room costs nothing. */
export function BranchRoom({ world, color, go, mapHref, backHref, onLocked }: Props) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), prompt = useRef<HTMLDivElement>(null), toast = useRef<HTMLDivElement>(null);
  const eye = useRef<Eye>({ ...world.spawn, pitch: 0 });
  const keys = useRef(new Set<string>()), stick = useRef({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; moved: number; type: string } | null>(null);
  const dirty = useRef(true), raf = useRef(0), last = useRef(0), traveling = useRef(false), size = useRef({ w: 0, h: 0 }), tgt = useRef<Target | null>(null), shown = useRef(""), bumped = useRef(false);
  const lookAcc = useRef({ yaw: 0, pitch: 0 }), drawn = useRef(0);

  const showToast = useCallback((s: string) => { const t = toast.current; if (!t) return; t.textContent = s; t.style.opacity = "1"; window.clearTimeout((t as unknown as { _t?: number })._t); (t as unknown as { _t?: number })._t = window.setTimeout(() => { t.style.opacity = "0"; }, 1800); }, []);

  const use = useCallback(() => {
    if (traveling.current) return;
    const t = facing(world, eye.current); if (!t) return;
    if (t.kind === "door") { if (t.door.state === "open" && t.door.toSlug) { traveling.current = true; go(`/branch/${t.door.toSlug}/room?from=${encodeURIComponent(world.slug)}`, true); } else { showToast("Sealed. You have not found that room yet."); onLocked(); } }
    else { traveling.current = true; go(t.prop.href, false); }
  }, [world, go, onLocked, showToast]);

  const turnTo = useCallback((yaw: number) => { eye.current = { ...eye.current, yaw: wrapYaw(yaw) }; dirty.current = true; wake(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = useCallback((now: number) => {
    raf.current = 0;
    const c = canvas.current, st = stage.current; if (!c || !st) return;
    const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0.016); last.current = now;
    const k = keys.current; let f = 0, s = 0, tr = 0, lk = 0;
    for (const code of k) { const v = KEYS[code]; if (v) { f += v[0]; s += v[1]; tr += v[2]; lk += v[3]; } }
    f += stick.current.y; s += stick.current.x;
    const run = k.has("ShiftLeft") || k.has("ShiftRight") || Math.hypot(stick.current.x, stick.current.y) > 0.93;
    const la = lookAcc.current; lookAcc.current = { yaw: 0, pitch: 0 };
    let e = eye.current; if (la.yaw || la.pitch) e = { ...e, yaw: wrapYaw(e.yaw + la.yaw), pitch: clamp(e.pitch + la.pitch, -MAX_PITCH, MAX_PITCH) };
    const r = stepEye(world, e, { forward: clamp(f, -1, 1), strafe: clamp(s, -1, 1), turn: clamp(tr, -1, 1), look: clamp(lk, -1, 1), run }, dt);
    const changed = r.moved || !!la.yaw || !!la.pitch; eye.current = r.eye;
    if (!traveling.current) {
      const d = doorWalkedInto(world, r.eye, r.into);
      if (d?.toSlug) { traveling.current = true; go(`/branch/${d.toSlug}/room?from=${encodeURIComponent(world.slug)}`, true); }
      else if (r.into && world.doors.some((x) => x.edge === r.into!.edge && x.state === "locked" && Math.abs((r.eye.x - x.x) * x.tx + (r.eye.z - x.z) * x.tz) <= x.hw)) { if (!bumped.current) { bumped.current = true; showToast("Sealed. You have not found that room yet."); onLocked(); } }
      else if (!r.into) bumped.current = false;
    }
    if (changed || dirty.current) {
      dirty.current = false;
      const t = facing(world, r.eye); tgt.current = t;
      const label = useLabel(t); if (label !== shown.current) { shown.current = label; if (prompt.current) { prompt.current.textContent = label; prompt.current.style.opacity = label ? "1" : "0"; } }
      const w = size.current.w, h = size.current.h; if (w && h) { const ctx = c.getContext("2d"); if (ctx) paintRoom(ctx, w, h, world, r.eye, color, t); }
      st.dataset.x = r.eye.x.toFixed(2); st.dataset.z = r.eye.z.toFixed(2); st.dataset.yaw = r.eye.yaw.toFixed(3); st.dataset.target = label; st.dataset.drawn = String(++drawn.current);
    }
    if (changed || k.size || stick.current.x || stick.current.y || drag.current) raf.current = requestAnimationFrame(frame); else last.current = 0;
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
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyF") { if (e.code === "Enter" && (e.target as HTMLElement)?.closest?.("a,button")) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) use(); return; }
      if (KEYS[e.code] || e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); e.stopPropagation(); keys.current.add(e.code); wakeRef.current(); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const blur = () => { keys.current.clear(); stick.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur); cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [use]);

  const onStick = useCallback((x: number, y: number) => { stick.current = { x, y }; wakeRef.current(); }, []);
  const pdown = (e: React.PointerEvent) => { if (drag.current) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ } stage.current?.focus({ preventScroll: true }); };
  const pmove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    lookAcc.current.yaw += dx * 0.006; lookAcc.current.pitch -= dy * 0.004; wakeRef.current();
  };
  const pup = (e: React.PointerEvent) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; drag.current = null; if (d.moved < 6 && d.type === "mouse" && e.type === "pointerup") use(); };

  return (
    <div className="rm" data-testid="branch-room" style={{ ["--rm" as string]: color }}>
      <div ref={stage} className="rm-stage" tabIndex={0} aria-label={`${world.name}: walk with W A S D or the arrow keys, Space to use`} data-testid="room-stage" data-room={world.slug}
        onPointerDown={pdown} onPointerMove={pmove} onPointerUp={pup} onPointerCancel={pup}>
        <canvas ref={canvas} />
      </div>
      <div className="rm-scan" aria-hidden="true" />
      <div className="rm-title">{world.name}</div>
      <div ref={prompt} className="rm-prompt" data-testid="room-prompt" aria-live="polite" />
      <div ref={toast} className="rm-toast" role="status" />
      <div className="rm-bar">
        <Link to={backHref} className="rm-btn" data-testid="room-back">Back</Link>
        <Link to={mapHref} className="rm-btn" data-testid="room-map">Map</Link>
      </div>
      <div className="rm-pad"><RoomStick onChange={onStick} /></div>
      <button type="button" className="rm-use" data-testid="room-use" onClick={() => { use(); }} onPointerDown={(e) => e.stopPropagation()}>Use</button>
      <p className="rm-hint">W A S D / arrows move · Q E turn · Space use · Esc leave</p>
      <ul className="sr-only">
        {world.doors.map((d) => (
          <li key={d.id}>
            <button type="button" data-testid={`face-${d.id}`} onClick={() => turnTo(Math.atan2(d.z - eye.current.z, d.x - eye.current.x))}>
              {d.state === "open" ? `Face the door to ${d.name}` : "Face a sealed door"}
            </button>
          </li>
        ))}
        {world.props.map((p) => <li key={p.id}><Link to={p.href}>{p.label}</Link></li>)}
      </ul>
    </div>
  );
}
