import { useEffect, useRef, useState } from "react";
import { EVENTS, KINDS, MAX_ACTORS, MAX_WIRES, MESSAGES, cleanDoc, newId, type Actor, type Kind, type RoomDoc, type Wire } from "../lib/roomDoc";
import type { RoomWorld } from "../lib/roomWorld";

const SNAP = 0.25, PLAN = 300;
const PALETTE = ["#7a8cff", "#ff7ab6", "#7affc8", "#ffd27a", "#c07aff", "#7ad7ff"];
const DEFAULTS: Record<Kind, Partial<Actor>> = {
  solid: { w: 2, d: 2, h: 1.5 }, ghost: { w: 2, d: 2, h: 1.5 }, trigger: { w: 3, d: 3, h: 2 }, light: { w: 1, d: 1, h: 2.4 }, marker: { w: 0.6, d: 0.6, h: 1.6 },
};
const KIND_HELP: Record<Kind, string> = {
  solid: "Blocks you. Can be shown or hidden by wires.", ghost: "You walk through it. Cosmetic.", trigger: "A zone that sends “enter” and “exit” when you step in or out.",
  light: "A glow. Can be turned on or off.", marker: "A named point other things can listen to or send to.",
};
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Props {
  world: RoomWorld; doc: RoomDoc; onDoc: (d: RoomDoc) => void;
  sel: string | null; setSel: (id: string | null) => void;
  where: () => { x: number; z: number; yaw: number };
  dirty: boolean; busy: boolean; error: string; playing: boolean; onPlay: (on: boolean) => void;
  onSave: () => void; onRevert: () => void; onClose: () => void;
}

/** The room editor: a plan view of the room, a list of what is in it, and wires between things. Pure form UI, no logic of its own: every change is a new document handed up. */
export function RoomEditor({ world, doc, onDoc, sel, setSel, where, dirty, busy, error, playing, onPlay, onSave, onRevert, onClose }: Props) {
  const cv = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: string; dx: number; dz: number } | null>(null);
  const scale = (PLAN / 2 - 8) / (world.inr + 1.5);
  const toPx = (x: number, z: number): [number, number] => [PLAN / 2 + x * scale, PLAN / 2 + z * scale];
  const fromPx = (px: number, py: number): [number, number] => [(px - PLAN / 2) / scale, (py - PLAN / 2) / scale];
  const a = doc.actors.find((x) => x.id === sel) ?? null;
  const commit = (actors: Actor[], wires: Wire[] = doc.wires) => onDoc(cleanDoc({ ...doc, actors, wires }));
  const patch = (id: string, p: Partial<Actor>) => commit(doc.actors.map((x) => (x.id === id ? { ...x, ...p } : x)));

  useEffect(() => { // the plan view
    const c = cv.current, g = c?.getContext("2d"); if (!c || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = PLAN * dpr; c.height = PLAN * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, PLAN, PLAN);
    g.beginPath(); world.verts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath();
    g.fillStyle = "rgba(255,255,255,.04)"; g.fill(); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.beginPath();
    for (let m = -Math.floor(world.inr); m <= world.inr; m++) { const [x0, y0] = toPx(m, -world.inr), [x1, y1] = toPx(m, world.inr); g.moveTo(x0, y0); g.lineTo(x1, y1); const [x2, y2] = toPx(-world.inr, m), [x3, y3] = toPx(world.inr, m); g.moveTo(x2, y2); g.lineTo(x3, y3); }
    g.stroke();
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
    const [px, py] = rel(e), o = pick(px, py); setSel(o ? o.id : null);
    if (o) { const [x, z] = fromPx(px, py); drag.current = { id: o.id, dx: o.x - x, dz: o.z - z }; cv.current!.setPointerCapture(e.pointerId); }
  };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const [px, py] = rel(e), [x, z] = fromPx(px, py); patch(d.id, { x: snap(x + d.dx), z: snap(z + d.dz) }); };
  const up = () => { drag.current = null; };

  const add = (kind: Kind) => {
    if (doc.actors.length >= MAX_ACTORS) return;
    const e = where(), id = newId(doc.actors.map((x) => x.id)), n = doc.actors.filter((x) => x.kind === kind).length + 1;
    const o: Actor = { id, kind, name: `${kind} ${n}`, x: snap(e.x + Math.cos(e.yaw) * 3), z: snap(e.z + Math.sin(e.yaw) * 3), w: 2, d: 2, h: 1.5, rot: 0, sides: 0, color: PALETTE[doc.actors.length % PALETTE.length], on: true, ...DEFAULTS[kind] };
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
        <button type="button" className="re-b" data-testid="re-play" aria-pressed={playing} onClick={() => onPlay(!playing)}>{playing ? "■ Stop test" : "▶ Test play"}</button>
        <button type="button" className="re-b" data-testid="re-close" onClick={onClose} aria-label="Close editor">✕</button>
      </div>
      <canvas ref={cv} className="re-plan" data-testid="re-plan" style={{ width: PLAN, height: PLAN }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Plan view of the room. Click a thing to select it, drag to move it." />
      <p className="re-note">White dot: you. Drag things to move. New things appear 3 m in front of you.</p>
      <div className="re-add" role="group" aria-label="Add">
        {KINDS.map((k) => <button key={k} type="button" className="re-b" data-testid={`re-add-${k}`} title={KIND_HELP[k]} onClick={() => add(k)}>+ {k}</button>)}
      </div>
      <ul className="re-list" aria-label="Things in this room">
        {doc.actors.map((o) => <li key={o.id}><button type="button" data-testid={`re-item-${o.id}`} aria-pressed={o.id === sel} onClick={() => setSel(o.id)}><i style={{ background: o.color }} />{o.name}<small>{o.kind}</small></button></li>)}
        {!doc.actors.length && <li className="re-empty">Nothing here yet. Add something above.</li>}
      </ul>
      {a && (
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
