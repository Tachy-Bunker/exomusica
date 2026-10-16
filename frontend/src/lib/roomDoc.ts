// A room's authored content: Actors that talk by wires. Pure data + a small event runtime, no DOM, no allocation per tick when idle.
// The backend keeps an identical copy of the types and `cleanDoc` (backend/src/lib/roomDoc.ts); keep them in step.

export const MAX_ACTORS = 150;
export const MAX_WIRES = 400;
export const MAX_FIRES_PER_TICK = 64;      // total messages handled in one tick
export const MAX_PER_ACTOR_TICK = 8;       // per target, so a loop cannot run away
export const MAX_DELAY = 600;              // seconds
export const RANGE = 200;                  // metres, positions are clamped to +-RANGE

export type Kind = "solid" | "ghost" | "trigger" | "light" | "marker" | "pool" | "artifact" | "hazard" | "boss" | "decal";
export const KINDS: Kind[] = ["solid", "ghost", "trigger", "light", "marker", "pool", "artifact", "hazard", "boss", "decal"];

/** Events an actor can emit, per kind. "start" fires once when the room loads. */
export const EVENTS: Record<Kind, string[]> = {
  solid: ["shown", "hidden", "arrived", "start"],
  ghost: ["shown", "hidden", "arrived", "start"],
  trigger: ["enter", "exit", "start"],
  light: ["shown", "hidden", "start"],
  marker: ["scanned", "start"],
  pool: ["shown", "hidden", "start"],
  artifact: ["scanned", "shown", "hidden", "start"],
  hazard: ["enter", "exit", "shown", "hidden", "start"],
  boss: ["engaged", "defeated", "shown", "hidden", "start"],
  decal: ["shown", "hidden", "start"],
};
/** Messages an actor accepts. */
export const MESSAGES: Record<Kind, string[]> = {
  solid: ["show", "hide", "toggle", "setcolor", "move"],
  ghost: ["show", "hide", "toggle", "setcolor", "move"],
  trigger: ["enable", "disable", "fire"],
  light: ["show", "hide", "toggle", "setcolor"],
  marker: ["fire", "teleport", "say", "play", "shot"],
  pool: ["show", "hide", "toggle", "setcolor"],
  artifact: ["show", "hide", "toggle", "setcolor"],
  hazard: ["show", "hide", "toggle", "setcolor"],
  boss: ["show", "hide", "toggle", "setcolor"],
  decal: ["show", "hide", "toggle", "setcolor"],
};
/** Messages that need a value (`Wire.arg`): a colour, a line of text, a sound name. */
export const ARG_KIND: Record<string, "color" | "text" | "sound" | "secs"> = { setcolor: "color", say: "text", play: "sound", shot: "secs" };
export const SOUNDS = ["chime", "hum", "pulse", "drop", "swell"] as const;
export const MAX_ARG = 80;

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
  pdx: number; pdz: number; pdy: number; // solid/ghost: it travels this far (metres) and back, smoothly
  pmode: number;                       // 0 = travels back and forth for ever, 1 = only when called (message "move": goes to the far end, the next call brings it back)
  ptime: number;                       // seconds for one way (1..120); 0 = stands still
  lift: number;                        // solid/ghost: height of its underside above the floor (a platform, a low ceiling), 0..12 m
  season: number;                      // shows only in one season of the visitor's calendar: 0 any, 1 spring, 2 summer, 3 autumn, 4 winter (see seasonOf)
}
export const MAX_LORE = 1500, MAX_TEXT = 60;
/** Catalogue props (shapes in `roomProps.ts`): id -> blocks you? Frames, arches and the like are walk-through. */
export const PROP_BLOCKS: Record<string, boolean> = { spire: true, monolith: true, pylon: true, totem: true, rubble: true, crates: true, hullplate: true, stairs: false, ramp: false, frame: false, arch: false, ribs: false, scaffold: false, drifter: false };
const q4 = (v: number) => Math.round(v * 4) / 4;
/** Travel of a solid or ghost: offset (x, z, up) and seconds one way. Without time or with no offset it stands still. */
function pathOf(kind: Kind, o: Record<string, unknown>): { pdx: number; pdz: number; pdy: number; ptime: number; pmode: number } {
  const z = { pdx: 0, pdz: 0, pdy: 0, ptime: 0, pmode: 0 };
  if (kind !== "solid" && kind !== "ghost") return z;
  const dx = q4(num(o.pdx, -40, 40, 0)), dz = q4(num(o.pdz, -40, 40, 0)), dy = q4(num(o.pdy, -10, 10, 0)), t = Math.round(num(o.ptime, 0, 120, 0));
  return dx || dz || dy ? { pdx: dx, pdz: dz, pdy: dy, ptime: t >= 1 ? t : 0, pmode: o.pmode === 1 && t >= 1 ? 1 : 0 } : z;
}
/** Seconds on the shared clock that moving things follow (set once a frame by the room). */
export let pathT = 0;
export const setPathT = (t: number): void => { pathT = t; };
const MV = {} as Actor;
/** A moving actor as it stands right now (a shared scratch copy: use it, do not keep it). Static actors come back as they are. */
export function atNow(a: Actor, rt?: WireRuntime | null): Actor {
  if (!a.ptime) return a;
  const s = a.pmode === 1 ? (rt ? rt.fracOf(a) : 0) : 0.5 - 0.5 * Math.cos((Math.PI * pathT) / a.ptime);
  Object.assign(MV, a); MV.x = a.x + a.pdx * s; MV.z = a.z + a.pdz * s; MV.lift = Math.max(0, a.lift + a.pdy * s); return MV;
}
/** Slope props: stairs (N steps) and a ramp (smooth). You walk up them; the value is the number of steps, 0 = smooth. */
export const PROP_SLOPE: Record<string, number> = { stairs: 5, ramp: 0 };
export const STEP = 0.5, BODY = 1.7;       // you step up this much for free; you need this much headroom
export const GATE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** True when the actor is shut away by its milestone gate: `reached` holds the milestone keys the community has reached. */
export const gatedOut = (a: Pick<Actor, "gate" | "gateOff">, reached: ReadonlySet<string> | null): boolean => !!a.gate && (reached?.has(a.gate) === true) === a.gateOff;
/** Seasons, by the month on the visitor's clock (Northern reckoning): 0 any, 1 spring, 2 summer, 3 autumn, 4 winter. */
export const SEASONS = ["any", "spring", "summer", "autumn", "winter"] as const, MAX_SEASON = 4;
export const seasonOf = (month: number): number => { const m = Math.min(11, Math.max(0, Math.floor(month) || 0)); return m >= 2 && m <= 4 ? 1 : m >= 5 && m <= 7 ? 2 : m >= 8 && m <= 10 ? 3 : 4; };
/** True when the actor is out of season. `season` is the visitor's season (0 = unknown: nothing is seasonal). */
export const seasonShut = (a: Pick<Actor, "season">, season: number): boolean => a.season !== 0 && season !== 0 && a.season !== season;
export interface Wire { from: string; ev: string; to: string; msg: string; delay: number; once: boolean; arg?: string }
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
/** Neon trim: a thin line of light along the foot of every wall, and along the top of them when `high`. */
export interface Trim { color: string; high: boolean }
/** Room hum: a quiet bed of sound while you are in the room. 0 none, 1 drone, 2 air, 3 pulse (a slow swell, never a flash). */
export const HUMS = ["none", "drone", "air", "pulse"] as const, MAX_HUM = 3;
/** Decals: a picture or words stuck to a surface. Not scannable, nothing to walk into. At most this many a room. */
export const MAX_DECALS = 64;
export interface RoomDoc { v: 1; version: number; actors: Actor[]; wires: Wire[]; tex: Tex[]; floor: number[]; bands: Band[]; grade: Grade | null; ceil: number; sky: Sky | null; flock: Flock | null; inherit: boolean; /** corridors: material (1-based, 0 = none) on the floor and on both walls; the ceiling is `ceil` */ cfloor: number; cwall: number; /** wall dressing: 0 none, 1 light, 2 normal, 3 heavy */ dress: number; /** light shafts from the ceiling, 0 = none .. 1 */ shafts: number; /** neon trim along the walls, null = none */ trim: Trim | null; /** room hum, see HUMS */ hum: number; /** the Logbook entry written once this room has been explored ("" = made from the branch description) */ log: string }

export const emptyDoc = (): RoomDoc => ({ v: 1, version: 0, actors: [], wires: [], tex: [], floor: [], bands: [], grade: null, ceil: 0, sky: null, flock: null, inherit: true, cfloor: 0, cwall: 0, dress: 2, shafts: 0, trim: null, hum: 0, log: "" });

const num = (x: unknown, lo: number, hi: number, d: number) => { const n = typeof x === "number" && Number.isFinite(x) ? x : d; return Math.min(hi, Math.max(lo, n)); };
const str = (x: unknown, max: number, d = "") => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").slice(0, max) : d);
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Turns anything into a valid doc: clamps numbers, drops unknown kinds, dangling wires and duplicates. Never throws. */
export function cleanDoc(raw: unknown): RoomDoc {
  const out = emptyDoc();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  out.version = Math.floor(num(r.version, 0, 1e9, 0));
  const ids = new Set<string>(); let decals = 0;
  if (Array.isArray(r.actors)) for (const a of r.actors) {
    if (out.actors.length >= MAX_ACTORS || !a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const id = str(o.id, 24).replace(/[^a-zA-Z0-9_-]/g, "");
    const kind = KINDS.find((k) => k === o.kind);
    if (!id || !kind || ids.has(id)) continue;
    if (kind === "decal") { if (decals >= MAX_DECALS) continue; decals++; }
    const panel = kind === "artifact" || kind === "boss" || kind === "decal";
    ids.add(id);
    const sides = Math.round(num(o.sides, 0, 8, 0));
    out.actors.push({
      id, kind, name: str(o.name, 40, kind), x: num(o.x, -RANGE, RANGE, 0), z: num(o.z, -RANGE, RANGE, 0),
      w: num(o.w, 0.1, 60, 2), d: num(o.d, 0.1, 60, 2), h: num(o.h, 0, 30, kind === "solid" || kind === "ghost" ? 1.5 : kind === "artifact" || kind === "decal" ? 1 : 2),
      rot: num(o.rot, -7, 7, 0), sides: sides === 1 || sides === 2 ? 0 : sides,
      color: typeof o.color === "string" && COLOR.test(o.color) ? o.color.toLowerCase() : "#7a8cff",
      on: o.on === false ? false : true, pulse: kind === "light" || kind === "pool" || kind === "hazard" ? Math.round(num(o.pulse, 0, 2, 0) * 4) / 4 : 0,
      text: panel ? str(o.text, MAX_TEXT, "") : "", lore: kind === "artifact" || kind === "boss" ? str(o.lore, MAX_LORE, "") : "",
      img: panel ? Math.round(num(o.img, 0, 1e9, 0)) : 0, mode: panel || kind === "hazard" ? Math.round(num(o.mode, 0, 2, 0)) : 0, visor: kind === "artifact" && o.visor === true,
      prop: (kind === "solid" || kind === "ghost") && typeof o.prop === "string" && Object.hasOwn(PROP_BLOCKS, o.prop) ? o.prop : "",
      gate: typeof o.gate === "string" && GATE.test(o.gate) ? o.gate : "", gateOff: typeof o.gate === "string" && GATE.test(o.gate) && o.gateOff === true,
      lift: kind === "solid" || kind === "ghost" ? Math.round(num(o.lift, 0, 12, 0) * 4) / 4 : 0, season: Math.round(num(o.season, 0, MAX_SEASON, 0)),
      ...pathOf(kind, o),
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
    const ak = ARG_KIND[msg];
    if (ak) { const raw = typeof o.arg === "string" ? o.arg : ""; const v = ak === "secs" ? (Number.isFinite(parseFloat(raw)) ? String(Math.min(20, Math.max(1, Math.round(parseFloat(raw))))) : "") : ak === "color" ? (COLOR.test(raw) ? raw.toLowerCase() : "") : ak === "sound" ? (SOUNDS.find((x) => x === raw) ?? "") : raw.trim().slice(0, MAX_ARG); if (!v) continue; wire.arg = v; }
    const key = `${wire.from}|${wire.ev}|${wire.to}|${wire.msg}|${wire.delay}|${wire.arg ?? ""}`;
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
  out.cfloor = Math.round(num(r.cfloor, 0, out.tex.length, 0)); out.cwall = Math.round(num(r.cwall, 0, out.tex.length, 0));
  if (r.sky && typeof r.sky === "object") { const k = r.sky as Record<string, unknown>, id = Number(k.id); if (Number.isInteger(id) && id >= 1 && id <= 1e9) out.sky = { id, speed: Math.round(num(k.speed, -MAX_SKY_SPEED, MAX_SKY_SPEED, 0) * 2) / 2 }; }
  out.dress = Math.round(num(r.dress, 0, 3, 2)); out.shafts = Math.round(num(r.shafts, 0, 1, 0) * 10) / 10;
  if (r.trim && typeof r.trim === "object") { const t = r.trim as Record<string, unknown>; if (typeof t.color === "string" && COLOR.test(t.color)) out.trim = { color: t.color.toLowerCase(), high: t.high === true }; }
  out.hum = Math.round(num(r.hum, 0, MAX_HUM, 0));
  out.log = str(r.log, MAX_LORE);
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
  /** Player-facing messages sent to a marker: teleport here, say a line, play a sound. */
  onAct: ((id: string, msg: string, arg: string) => void) | null = null;
  /** Things that travel only when called: where they are heading from and to (0 = home, 1 = far end), and since when. */
  mv = new Map<string, { t0: number; from: number; to: number }>();
  /** The ones still on their way (the room keeps repainting while there are any). */
  moving = new Set<string>();
  /** The runtime's clock: the time of the last tick, seconds. */
  now = 0;
  /** How far along its path a called thing is right now: 0 home .. 1 far end, eased. */
  fracOf(a: Actor): number {
    const m = this.mv.get(a.id); if (!m) return 0;
    const dur = a.ptime * Math.abs(m.to - m.from), p = dur > 0 ? Math.min(1, Math.max(0, (this.now - m.t0) / dur)) : 1;
    return m.from + (m.to - m.from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
  }
  /** Bosses already answered on this device (the painter shows them as a quiet echo). */
  done = new Set<string>();
  /** Colours set by wires (id -> #rrggbb), read by the painter. */
  col = new Map<string, string>();
  /** Actors shut away by a milestone gate: always off, whatever wires say. */
  shut = new Set<string>();
  constructor(readonly doc: RoomDoc, reached: ReadonlySet<string> | null = null, season = 0) {
    for (const a of doc.actors) { const g = gatedOut(a, reached) || seasonShut(a, season); if (g) this.shut.add(a.id); this.on.set(a.id, a.on && !g); this.enabled.set(a.id, a.on && !g); }
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
    this.now = t;
    if (this.moving.size) for (const id of this.moving) { const m = this.mv.get(id), a = this.doc.actors.find((x) => x.id === id); if (!m || !a || t >= m.t0 + a.ptime * Math.abs(m.to - m.from)) { this.moving.delete(id); this.emit(id, "arrived", t); } }
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
      this.deliver(w.to, w.msg, t, w.arg);
    }
  }
  private deliver(id: string, msg: string, t: number, arg = "") {
    const a = this.doc.actors.find((x) => x.id === id); if (!a || this.shut.has(id)) return;
    if (a.kind === "trigger") {
      if (msg === "fire") { this.onFire?.(id); this.emit(id, "enter", t); return; }
      const v = msg === "enable"; if (this.enabled.get(id) !== v) { this.enabled.set(id, v); this.changed.push(id); } return;
    }
    if (a.kind === "marker") { if (msg === "fire") { this.onFire?.(id); this.emit(id, "scanned", t); } else this.onAct?.(id, msg, arg); return; }
    if (msg === "setcolor") { if (arg && this.col.get(id) !== arg) { this.col.set(id, arg); this.changed.push(id); } return; }
    if (msg === "move") { // a called platform goes to the far end; the next call brings it back
      if (a.ptime && a.pmode === 1) { const cur = this.fracOf(a), m = this.mv.get(id), to = m && m.to === 1 ? 0 : 1; this.mv.set(id, { t0: t, from: cur, to }); this.moving.add(id); this.changed.push(id); }
      return;
    }
    const was = this.isOn(id);
    const now = msg === "show" ? true : msg === "hide" ? false : !was;
    if (now !== was) { this.on.set(id, now); this.changed.push(id); this.emit(id, now ? "shown" : "hidden", t); }
  }
  /** Player moved: triggers enabled and overlapped emit enter/exit. `inside` is kept per trigger. */
  private inside = new Set<string>();
  probe(px: number, pz: number, t: number) {
    for (const a of this.doc.actors) {
      if (a.kind !== "trigger" && a.kind !== "hazard") continue;
      const hit = (a.kind === "hazard" ? this.on.get(a.id) === true : this.enabled.get(a.id) === true) && insideBox(a, px, pz);
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

/** Local coordinates of (x, z) in an actor's frame (box actors): `lx` along its width, `lz` along its depth. */
const local = (a: Actor, x: number, z: number, out: { lx: number; lz: number }): void => {
  const dx = x - a.x, dz = z - a.z, c = Math.cos(-a.rot), s = Math.sin(-a.rot); out.lx = dx * c - dz * s; out.lz = dx * s + dz * c;
};
const LC = { lx: 0, lz: 0 };
/** Height of a slope prop's surface at (x, z), clamped onto its footprint. Stairs are quantised to their steps. */
function slopeTop(a: Actor, x: number, z: number): number {
  local(a, x, z, LC); const u = Math.max(0, Math.min(1, LC.lx / a.w + 0.5)), n = PROP_SLOPE[a.prop];
  return a.lift + a.h * (n ? Math.min(n, Math.floor(u * n) + 1) / n : u);
}
/** Push a moving circle (radius r) out of every visible solid it would hit at foot height `fy`. Returns true if it moved. Writes the result into `out`. */
export function pushOut(doc: RoomDoc, rt: WireRuntime, x: number, z: number, r: number, out: { x: number; z: number }, fy = 0): boolean {
  out.x = x; out.z = z; let moved = false;
  for (const a0 of doc.actors) {
    if (a0.kind !== "solid" || !rt.isOn(a0.id)) continue;
    const a = atNow(a0, rt), slope = a.prop ? PROP_SLOPE[a.prop] !== undefined : false;
    if (a.prop && !PROP_BLOCKS[a.prop] && !slope) continue;
    if (!slope && (a.lift >= fy + BODY || a.lift + a.h <= fy + STEP)) continue; // you pass under it, or step onto it
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
    if (slope && (a.lift >= fy + BODY || slopeTop(a, out.x, out.z) <= fy + STEP)) continue; // a slope you can walk up is not a wall
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let nx = lx, nz = lz;
    if (px < pz) nx = lx < 0 ? -hx : hx; else nz = lz < 0 ? -hz : hz;
    const c2 = Math.cos(a.rot), s2 = Math.sin(a.rot);
    out.x = a.x + nx * c2 - nz * s2; out.z = a.z + nx * s2 + nz * c2; moved = true;
  }
  return moved;
}
/** The moving solid under (x, z) whose top is the floor for feet at `fy` (within a step), or null. Fixed blocks and open floor give null: only moving solids carry you. Returns the stored actor, not the scratch copy. */
export function carrierAt(doc: RoomDoc, rt: WireRuntime, x: number, z: number, fy: number): Actor | null {
  let g = 0, best: Actor | null = null;
  for (const a0 of doc.actors) {
    if (a0.kind !== "solid" || !a0.ptime || !rt.isOn(a0.id)) continue;
    const a = atNow(a0, rt); if (!insideBox(a, x, z)) continue;
    const slope = a.prop ? PROP_SLOPE[a.prop] !== undefined : false;
    if (a.prop && !PROP_BLOCKS[a.prop] && !slope) continue;
    const top = slope ? slopeTop(a, x, z) : a.lift + a.h;
    if (top <= fy + STEP + 1e-6 && top > g) { g = top; best = a0; }
  }
  return best;
}
/** The floor under (x, z) for someone whose feet are at `fy`: 0, or the top of a solid / slope they can step onto. */
export function groundAt(doc: RoomDoc, rt: WireRuntime, x: number, z: number, fy: number): number {
  let g = 0;
  for (const a0 of doc.actors) {
    if (a0.kind !== "solid" || !rt.isOn(a0.id)) continue;
    const a = atNow(a0, rt); if (!insideBox(a, x, z)) continue;
    const slope = a.prop ? PROP_SLOPE[a.prop] !== undefined : false;
    if (a.prop && !PROP_BLOCKS[a.prop] && !slope) continue;
    const top = slope ? slopeTop(a, x, z) : a.lift + a.h;
    if (top <= fy + STEP + 1e-6 && top > g) g = top;
  }
  return g;
}
/** The underside of the lowest solid over (x, z) that is above a person standing with feet at `fy` (Infinity = open sky). */
export function ceilAt(doc: RoomDoc, rt: WireRuntime, x: number, z: number, fy: number): number {
  let c = Infinity;
  for (const a0 of doc.actors) {
    if (a0.kind !== "solid" || !rt.isOn(a0.id)) continue;
    const a = atNow(a0, rt); if (a.lift < fy + BODY - 0.05 || a.lift >= c || !insideBox(a, x, z)) continue;
    c = a.lift;
  }
  return c;
}
/** What the hazards under the player do right now. `slow` multiplies walking speed (1 = none), (`px`,`pz`) is a drift in m/s, `drain` is integrity lost per second. */
export interface HazardFx { slow: number; px: number; pz: number; drain: number }
export const HAZ_SLOW = 0.45, HAZ_PUSH = 2.0, HAZ_DRAIN = 0.16;
export function hazardAt(doc: RoomDoc, rt: WireRuntime, x: number, z: number, out: HazardFx): boolean {
  out.slow = 1; out.px = 0; out.pz = 0; out.drain = 0; let hit = false;
  for (const a of doc.actors) {
    if (a.kind !== "hazard" || !rt.isOn(a.id) || !insideBox(a, x, z)) continue;
    hit = true;
    if (a.mode === 0) out.slow = Math.min(out.slow, HAZ_SLOW);
    else if (a.mode === 1) { out.px += Math.cos(a.rot) * HAZ_PUSH; out.pz += Math.sin(a.rot) * HAZ_PUSH; }
    else out.drain += HAZ_DRAIN;
  }
  return hit;
}
