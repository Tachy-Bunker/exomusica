// A room's authored content: Actors that talk by wires. Pure data + a small event runtime, no DOM, no allocation per tick when idle.
// The backend keeps an identical copy of the types and `cleanDoc` (backend/src/lib/roomDoc.ts); keep them in step.

export const MAX_ACTORS = 150;
export const MAX_WIRES = 400;
export const MAX_FIRES_PER_TICK = 64;      // total messages handled in one tick
export const MAX_PER_ACTOR_TICK = 8;       // per target, so a loop cannot run away
export const MAX_DELAY = 600;              // seconds
export const RANGE = 200;                  // metres, positions are clamped to +-RANGE

export type Kind = "solid" | "ghost" | "trigger" | "light" | "marker";
export const KINDS: Kind[] = ["solid", "ghost", "trigger", "light", "marker"];

/** Events an actor can emit, per kind. "start" fires once when the room loads. */
export const EVENTS: Record<Kind, string[]> = {
  solid: ["shown", "hidden", "start"],
  ghost: ["shown", "hidden", "start"],
  trigger: ["enter", "exit", "start"],
  light: ["shown", "hidden", "start"],
  marker: ["scanned", "start"],
};
/** Messages an actor accepts. */
export const MESSAGES: Record<Kind, string[]> = {
  solid: ["show", "hide", "toggle"],
  ghost: ["show", "hide", "toggle"],
  trigger: ["enable", "disable", "fire"],
  light: ["show", "hide", "toggle"],
  marker: ["fire"],
};

export interface Actor {
  id: string;
  kind: Kind;
  name: string;
  x: number; z: number;
  w: number; d: number; h: number;     // footprint and height, metres
  rot: number;                         // radians
  sides: number;                       // 0 = box, 3..8 = regular prism
  color: string;                       // #rrggbb
  on: boolean;                         // starts visible/active
}
export interface Wire { from: string; ev: string; to: string; msg: string; delay: number; once: boolean }
export interface RoomDoc { v: 1; version: number; actors: Actor[]; wires: Wire[] }

export const emptyDoc = (): RoomDoc => ({ v: 1, version: 0, actors: [], wires: [] });

const num = (x: unknown, lo: number, hi: number, d: number) => { const n = typeof x === "number" && Number.isFinite(x) ? x : d; return Math.min(hi, Math.max(lo, n)); };
const str = (x: unknown, max: number, d = "") => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").slice(0, max) : d);
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Turns anything into a valid doc: clamps numbers, drops unknown kinds, dangling wires and duplicates. Never throws. */
export function cleanDoc(raw: unknown): RoomDoc {
  const out = emptyDoc();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  out.version = Math.floor(num(r.version, 0, 1e9, 0));
  const ids = new Set<string>();
  if (Array.isArray(r.actors)) for (const a of r.actors) {
    if (out.actors.length >= MAX_ACTORS || !a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const id = str(o.id, 24).replace(/[^a-zA-Z0-9_-]/g, "");
    const kind = KINDS.find((k) => k === o.kind);
    if (!id || !kind || ids.has(id)) continue;
    ids.add(id);
    const sides = Math.round(num(o.sides, 0, 8, 0));
    out.actors.push({
      id, kind, name: str(o.name, 40, kind), x: num(o.x, -RANGE, RANGE, 0), z: num(o.z, -RANGE, RANGE, 0),
      w: num(o.w, 0.1, 60, 2), d: num(o.d, 0.1, 60, 2), h: num(o.h, 0, 30, kind === "solid" || kind === "ghost" ? 1.5 : 2),
      rot: num(o.rot, -7, 7, 0), sides: sides === 1 || sides === 2 ? 0 : sides,
      color: typeof o.color === "string" && COLOR.test(o.color) ? o.color.toLowerCase() : "#7a8cff",
      on: o.on === false ? false : true,
    });
  }
  const seen = new Set<string>();
  if (Array.isArray(r.wires)) for (const w of r.wires) {
    if (out.wires.length >= MAX_WIRES || !w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    const from = out.actors.find((a) => a.id === o.from), to = out.actors.find((a) => a.id === o.to);
    if (!from || !to) continue;
    const ev = EVENTS[from.kind].find((e) => e === o.ev), msg = MESSAGES[to.kind].find((m) => m === o.msg);
    if (!ev || !msg) continue;
    const wire: Wire = { from: from.id, ev, to: to.id, msg, delay: Math.round(num(o.delay, 0, MAX_DELAY, 0) * 100) / 100, once: o.once === true };
    const key = `${wire.from}|${wire.ev}|${wire.to}|${wire.msg}|${wire.delay}`;
    if (seen.has(key)) continue;
    seen.add(key); out.wires.push(wire);
  }
  return out;
}

export const newId = (taken: Iterable<string>): string => {
  const t = new Set(taken); let i = t.size + 1; while (t.has("a" + i)) i++; return "a" + i;
};

/** Live state of a room: which actors are on, plus the queue of delayed messages. */
export class WireRuntime {
  on = new Map<string, boolean>();
  enabled = new Map<string, boolean>();            // triggers
  private byEvent = new Map<string, Wire[]>();
  private spent = new Set<Wire>();
  private q: { due: number; w: Wire }[] = [];
  /** Actors whose state changed since the last `drain`; the painter and collision read this. */
  changed: string[] = [];
  /** Called whenever a message reaches a marker/trigger "fire". */
  onFire: ((id: string) => void) | null = null;
  constructor(readonly doc: RoomDoc) {
    for (const a of doc.actors) { this.on.set(a.id, a.on); this.enabled.set(a.id, a.on); }
    for (const w of doc.wires) { const k = w.from + "|" + w.ev; const l = this.byEvent.get(k); if (l) l.push(w); else this.byEvent.set(k, [w]); }
  }
  isOn(id: string) { return this.on.get(id) === true; }
  /** An actor emits an event now (time t, seconds). Delayed wires are queued. */
  emit(id: string, ev: string, t: number) {
    const ws = this.byEvent.get(id + "|" + ev); if (!ws) return;
    for (const w of ws) {
      if (w.once && this.spent.has(w)) continue;
      if (w.once) this.spent.add(w);
      this.q.push({ due: t + w.delay, w });
    }
  }
  start(t: number) { for (const a of this.doc.actors) this.emit(a.id, "start", t); }
  /** Handles everything that is due. Messages that cause events are processed in the same tick, within the caps. */
  tick(t: number) {
    if (!this.q.length) return;
    let total = 0; const per = new Map<string, number>();
    for (let guard = 0; guard < MAX_FIRES_PER_TICK + 1; guard++) {
      let k = -1;
      for (let i = 0; i < this.q.length; i++) if (this.q[i].due <= t) { k = i; break; }
      if (k < 0) return;
      const { w } = this.q[k]; this.q.splice(k, 1);
      if (++total > MAX_FIRES_PER_TICK) { this.q.length = 0; return; }
      const n = (per.get(w.to) ?? 0) + 1; per.set(w.to, n);
      if (n > MAX_PER_ACTOR_TICK) continue;
      this.deliver(w.to, w.msg, t);
    }
  }
  private deliver(id: string, msg: string, t: number) {
    const a = this.doc.actors.find((x) => x.id === id); if (!a) return;
    if (a.kind === "trigger") {
      if (msg === "fire") { this.onFire?.(id); this.emit(id, "enter", t); return; }
      const v = msg === "enable"; if (this.enabled.get(id) !== v) { this.enabled.set(id, v); this.changed.push(id); } return;
    }
    if (a.kind === "marker") { if (msg === "fire") { this.onFire?.(id); this.emit(id, "scanned", t); } return; }
    const was = this.isOn(id);
    const now = msg === "show" ? true : msg === "hide" ? false : !was;
    if (now !== was) { this.on.set(id, now); this.changed.push(id); this.emit(id, now ? "shown" : "hidden", t); }
  }
  /** Player moved: triggers enabled and overlapped emit enter/exit. `inside` is kept per trigger. */
  private inside = new Set<string>();
  probe(px: number, pz: number, t: number) {
    for (const a of this.doc.actors) {
      if (a.kind !== "trigger") continue;
      const hit = this.enabled.get(a.id) === true && insideBox(a, px, pz);
      const was = this.inside.has(a.id);
      if (hit && !was) { this.inside.add(a.id); this.emit(a.id, "enter", t); }
      else if (!hit && was) { this.inside.delete(a.id); this.emit(a.id, "exit", t); }
    }
  }
  drain(): string[] { if (!this.changed.length) return this.changed; const c = this.changed; this.changed = []; return c; }
  get pending() { return this.q.length; }
  nextDue(): number { let m = Infinity; for (const e of this.q) if (e.due < m) m = e.due; return m; }
}

/** Point in the actor's footprint (box or prism approximated by its bounding circle for sides>0), rotated. */
export function insideBox(a: Actor, px: number, pz: number): boolean {
  const dx = px - a.x, dz = pz - a.z;
  if (a.sides >= 3) return Math.hypot(dx, dz) <= Math.min(a.w, a.d) / 2;
  const c = Math.cos(-a.rot), s = Math.sin(-a.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= a.w / 2 && Math.abs(lz) <= a.d / 2;
}

/** Push a moving circle (radius r) out of every visible solid. Returns true if it moved. Writes the result into `out`. */
export function pushOut(doc: RoomDoc, rt: WireRuntime, x: number, z: number, r: number, out: { x: number; z: number }): boolean {
  out.x = x; out.z = z; let moved = false;
  for (const a of doc.actors) {
    if (a.kind !== "solid" || !rt.isOn(a.id)) continue;
    const dx0 = out.x - a.x, dz0 = out.z - a.z;
    if (a.sides >= 3) {
      const rr = Math.min(a.w, a.d) / 2 + r, dist = Math.hypot(dx0, dz0);
      if (dist < rr) { const k = dist > 1e-6 ? rr / dist : 0; out.x = dist > 1e-6 ? a.x + dx0 * k : a.x + rr; out.z = dist > 1e-6 ? a.z + dz0 * k : a.z; moved = true; }
      continue;
    }
    const c = Math.cos(-a.rot), s = Math.sin(-a.rot);
    const lx = dx0 * c - dz0 * s, lz = dx0 * s + dz0 * c;
    const hx = a.w / 2 + r, hz = a.d / 2 + r;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let nx = lx, nz = lz;
    if (px < pz) nx = lx < 0 ? -hx : hx; else nz = lz < 0 ? -hz : hz;
    const c2 = Math.cos(a.rot), s2 = Math.sin(a.rot);
    out.x = a.x + nx * c2 - nz * s2; out.z = a.z + nx * s2 + nz * c2; moved = true;
  }
  return moved;
}
