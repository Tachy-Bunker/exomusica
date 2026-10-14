// A room's authored content: Actors that talk by wires. Pure data + a small event runtime, no DOM, no allocation per tick when idle.
// The backend keeps an identical copy of the types and `cleanDoc` (backend/src/lib/roomDoc.ts); keep them in step.

export const MAX_ACTORS = 150;
export const MAX_WIRES = 400;
export const MAX_FIRES_PER_TICK = 64;      // total messages handled in one tick
export const MAX_PER_ACTOR_TICK = 8;       // per target, so a loop cannot run away
export const MAX_DELAY = 600;              // seconds
export const RANGE = 200;                  // metres, positions are clamped to +-RANGE

export type Kind = "solid" | "ghost" | "trigger" | "light" | "marker" | "pool" | "artifact";
export const KINDS: Kind[] = ["solid", "ghost", "trigger", "light", "marker", "pool", "artifact"];

/** Events an actor can emit, per kind. "start" fires once when the room loads. */
export const EVENTS: Record<Kind, string[]> = {
  solid: ["shown", "hidden", "start"],
  ghost: ["shown", "hidden", "start"],
  trigger: ["enter", "exit", "start"],
  light: ["shown", "hidden", "start"],
  marker: ["scanned", "start"],
  pool: ["shown", "hidden", "start"],
  artifact: ["scanned", "shown", "hidden", "start"],
};
/** Messages an actor accepts. */
export const MESSAGES: Record<Kind, string[]> = {
  solid: ["show", "hide", "toggle"],
  ghost: ["show", "hide", "toggle"],
  trigger: ["enable", "disable", "fire"],
  light: ["show", "hide", "toggle"],
  marker: ["fire"],
  pool: ["show", "hide", "toggle"],
  artifact: ["show", "hide", "toggle"],
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
  pulse: number;                       // lights and pools: a slow smooth swell, 0..2 Hz (never a flash)
  // artifacts only: a panel with writing and/or a picture that can be scanned
  text: string;                        // the words on the panel (<= 60)
  lore: string;                        // the Logbook entry written when it is scanned (<= 1500)
  img: number;                         // library picture id shown on the panel, 0 = none
  mode: number;                        // 0 on a wall (fixed), 1 on the floor, 2 billboard (always faces you)
  visor: boolean;                      // only visible through the scan visor
  prop: string;                        // solid/ghost only: a catalogue prop ("" = plain box or prism)
  gate: string;                        // community milestone key; the thing exists only once it is reached ("" = always)
  gateOff: boolean;                    // with a gate: the opposite, it exists only until the milestone is reached
}
export const MAX_LORE = 1500, MAX_TEXT = 60;
/** Catalogue props (shapes in `roomProps.ts`): id -> blocks you? Frames, arches and the like are walk-through. */
export const PROP_BLOCKS: Record<string, boolean> = { spire: true, monolith: true, pylon: true, totem: true, rubble: true, crates: true, hullplate: true, frame: false, arch: false, ribs: false, scaffold: false, drifter: false };
export const GATE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** True when the actor is shut away by its milestone gate: `reached` holds the milestone keys the community has reached. */
export const gatedOut = (a: Pick<Actor, "gate" | "gateOff">, reached: ReadonlySet<string> | null): boolean => !!a.gate && (reached?.has(a.gate) === true) === a.gateOff;
export interface Wire { from: string; ev: string; to: string; msg: string; delay: number; once: boolean }
/** Looping floor textures. `kind` picks a procedural pattern; a room has up to MAX_TEX materials, and each floor cell is 0 (none) or a material number (1-based). */
export const TEX_KINDS = ["noise", "scan", "grid", "diamond", "circuit", "water", "brick", "static"] as const;
export const MAX_TEX = 16, GRID = 80;      // the floor grid is GRID x GRID cells of 0.5 m, centred on the room's middle
export interface Tex { kind: string; scale: number; scroll: number; tint: string }
/** `floor` is run-length coded: [count, value, count, value, ...] over GRID*GRID cells, row by row; empty means no paint. */
/** A strip of texture on a wall: wall edge `e`, from `u0` to `u1` along it (0..1), from height `y0` to `y1`, material `m` (1-based). */
export interface Band { e: number; u0: number; u1: number; y0: number; y1: number; m: number }
export const MAX_BANDS = 96, MAX_BANDS_PER_WALL = 12;
/** The room's mood: a colour veil over everything (strength 0..0.4) and a fog band at the horizon (density 0..1). */
export interface Grade { tint: string; tintA: number; fog: string; fogD: number }
/** `ceil` is the material (1-based, 0 = none) tiled over the whole ceiling. A material's `kind` is a built-in pattern or `u<id>`, a picture from the texture library. */
export const isUpload = (k: string): boolean => /^u\d{1,9}$/.test(k);
/** The sky: a 2:1 panorama from the library (`id`), seen overhead instead of a ceiling, turning `speed` degrees a second (wraps around). */
export interface Sky { id: number; speed: number }
export const MAX_SKY_SPEED = 30;
/** A few drifting specks: `kind` 0 dust, 1 fireflies; `n` at most MAX_FLOCK. They ignore walls and objects, fade out and reappear elsewhere. */
export interface Flock { kind: 0 | 1; n: number; color: string }
export const MAX_FLOCK = 12;
export interface RoomDoc { v: 1; version: number; actors: Actor[]; wires: Wire[]; tex: Tex[]; floor: number[]; bands: Band[]; grade: Grade | null; ceil: number; sky: Sky | null; flock: Flock | null; inherit: boolean }

export const emptyDoc = (): RoomDoc => ({ v: 1, version: 0, actors: [], wires: [], tex: [], floor: [], bands: [], grade: null, ceil: 0, sky: null, flock: null, inherit: true });

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
      w: num(o.w, 0.1, 60, 2), d: num(o.d, 0.1, 60, 2), h: num(o.h, 0, 30, kind === "solid" || kind === "ghost" ? 1.5 : kind === "artifact" ? 1 : 2),
      rot: num(o.rot, -7, 7, 0), sides: sides === 1 || sides === 2 ? 0 : sides,
      color: typeof o.color === "string" && COLOR.test(o.color) ? o.color.toLowerCase() : "#7a8cff",
      on: o.on === false ? false : true, pulse: kind === "light" || kind === "pool" ? Math.round(num(o.pulse, 0, 2, 0) * 4) / 4 : 0,
      text: kind === "artifact" ? str(o.text, MAX_TEXT, "") : "", lore: kind === "artifact" ? str(o.lore, MAX_LORE, "") : "",
      img: kind === "artifact" ? Math.round(num(o.img, 0, 1e9, 0)) : 0, mode: kind === "artifact" ? Math.round(num(o.mode, 0, 2, 0)) : 0, visor: kind === "artifact" && o.visor === true,
      prop: (kind === "solid" || kind === "ghost") && typeof o.prop === "string" && Object.hasOwn(PROP_BLOCKS, o.prop) ? o.prop : "",
      gate: typeof o.gate === "string" && GATE.test(o.gate) ? o.gate : "", gateOff: typeof o.gate === "string" && GATE.test(o.gate) && o.gateOff === true,
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
  if (Array.isArray(r.tex)) for (const t of r.tex) {
    if (out.tex.length >= MAX_TEX || !t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    out.tex.push({ kind: TEX_KINDS.find((k) => k === o.kind) ?? (typeof o.kind === "string" && isUpload(o.kind) ? o.kind : "noise"), scale: Math.round(num(o.scale, 0.5, 8, 2) * 4) / 4, scroll: Math.round(num(o.scroll, -2, 2, 0) * 20) / 20, tint: typeof o.tint === "string" && COLOR.test(o.tint) ? o.tint.toLowerCase() : "#7a8cff" });
  }
  if (Array.isArray(r.floor) && r.floor.length % 2 === 0 && r.floor.length <= GRID * GRID * 2) {
    let total = 0, ok = true; const f: number[] = [];
    for (let i = 0; i < r.floor.length; i += 2) {
      const c = r.floor[i], v = r.floor[i + 1];
      if (typeof c !== "number" || typeof v !== "number" || !Number.isInteger(c) || !Number.isInteger(v) || c < 1) { ok = false; break; }
      total += c; f.push(c, v >= 1 && v <= out.tex.length ? v : 0);
    }
    if (ok && total === GRID * GRID) out.floor = f;
  }
  const perWall = new Map<number, number>();
  if (Array.isArray(r.bands)) for (const b of r.bands) {
    if (out.bands.length >= MAX_BANDS || !b || typeof b !== "object" || !out.tex.length) continue;
    const o = b as Record<string, unknown>, e = Math.round(num(o.e, 0, 31, 0)), m = Math.round(num(o.m, 1, out.tex.length, 1));
    const u0 = num(o.u0, 0, 1, 0), u1 = num(o.u1, 0, 1, 1), y0 = num(o.y0, 0, 30, 0), y1 = num(o.y1, 0, 30, 2);
    if (u1 - u0 < 0.01 || y1 - y0 < 0.1 || (perWall.get(e) ?? 0) >= MAX_BANDS_PER_WALL) continue;
    perWall.set(e, (perWall.get(e) ?? 0) + 1);
    out.bands.push({ e, u0: Math.round(u0 * 1000) / 1000, u1: Math.round(u1 * 1000) / 1000, y0: Math.round(y0 * 100) / 100, y1: Math.round(y1 * 100) / 100, m });
  }
  out.ceil = Math.round(num(r.ceil, 0, out.tex.length, 0));
  if (r.sky && typeof r.sky === "object") { const k = r.sky as Record<string, unknown>, id = Number(k.id); if (Number.isInteger(id) && id >= 1 && id <= 1e9) out.sky = { id, speed: Math.round(num(k.speed, -MAX_SKY_SPEED, MAX_SKY_SPEED, 0) * 2) / 2 }; }
  out.inherit = r.inherit !== false; // true: mood, sky and flock this room does not set come from the theme of the branch above it
  if (r.flock && typeof r.flock === "object") { const k = r.flock as Record<string, unknown>, n = Math.round(num(k.n, 0, MAX_FLOCK, 0)); if (n >= 1) out.flock = { kind: k.kind === 1 ? 1 : 0, n, color: typeof k.color === "string" && COLOR.test(k.color) ? k.color.toLowerCase() : "#ffe9a8" }; }
  if (r.grade && typeof r.grade === "object") {
    const g = r.grade as Record<string, unknown>, tintA = Math.round(num(g.tintA, 0, 0.4, 0) * 100) / 100, fogD = Math.round(num(g.fogD, 0, 1, 0) * 100) / 100;
    if (tintA > 0 || fogD > 0) out.grade = { tint: typeof g.tint === "string" && COLOR.test(g.tint) ? g.tint.toLowerCase() : "#7a8cff", tintA, fog: typeof g.fog === "string" && COLOR.test(g.fog) ? g.fog.toLowerCase() : "#202040", fogD };
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
  /** Actors shut away by a milestone gate: always off, whatever wires say. */
  shut = new Set<string>();
  constructor(readonly doc: RoomDoc, reached: ReadonlySet<string> | null = null) {
    for (const a of doc.actors) { const g = gatedOut(a, reached); if (g) this.shut.add(a.id); this.on.set(a.id, a.on && !g); this.enabled.set(a.id, a.on && !g); }
    for (const w of doc.wires) { const k = w.from + "|" + w.ev; const l = this.byEvent.get(k); if (l) l.push(w); else this.byEvent.set(k, [w]); }
  }
  isOn(id: string) { return this.on.get(id) === true; }
  /** An actor emits an event now (time t, seconds). Delayed wires are queued. */
  emit(id: string, ev: string, t: number) {
    if (this.shut.has(id)) return;
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
    const a = this.doc.actors.find((x) => x.id === id); if (!a || this.shut.has(id)) return;
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
    if (a.kind !== "solid" || !rt.isOn(a.id) || (a.prop && !PROP_BLOCKS[a.prop])) continue;
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
