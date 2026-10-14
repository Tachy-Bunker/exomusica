// Draws the room from the eye: 2D canvas, painter's order, no 3D library. Everything is lines and flat fills.
// Built to make no garbage while painting: all the geometry, colour strings and labels of a room are prepared once (RoomPainter), and a frame only fills typed scratch buffers.
import { DOOR_H, type RoomDoor, type RoomProp, type RoomWorld } from "./roomWorld";
import { CORR_H, type Corridor, type Link } from "./roomScene";
import type { EchoField } from "./roomEcho";
import type { Shown } from "./roomNet";
import type { Drone } from "./roomDrone";
import type { Lock } from "./roomLock";
import { EYE_Y, NEAR, focalOf, type Eye, type Target } from "./roomView";
import type { Actor, RoomDoc, WireRuntime } from "./roomDoc";
import { frac, type FloorLayer } from "./roomFloor";
import { sheetTile, skyImage, texAvg, texSheet } from "./roomTextures";
import { inRoom } from "./roomScene";

/** What the owner built in the room you are in. Set by the room component; the painter draws it when `slug` matches. `edit` shows what visitors never see (triggers, markers, hidden things) and highlights `sel`. */
export const actorLayer: { slug: string; doc: RoomDoc | null; rt: WireRuntime | null; edit: boolean; sel: string | null; floor: FloorLayer | null; budget: number; now: number; anim: boolean; skyAnim: boolean; skySeen: boolean } = { slug: "", doc: null, rt: null, edit: false, sel: null, floor: null, budget: 260, now: 0, anim: false, skyAnim: false, skySeen: false };
interface ActorStyle { a: string; b: string; top: string; edge: string; faint: string; glowCol: string; pool1: string; pool2: string }
const styles = new WeakMap<Actor, ActorStyle>();
function styleOf(a: Actor): ActorStyle {
  let st = styles.get(a); if (st) return st;
  const ghost = a.kind === "ghost", c = a.color;
  st = { a: rgba(c, ghost ? 0.14 : 0.62), b: rgba(c, ghost ? 0.1 : 0.46), top: rgba(c, ghost ? 0.18 : 0.78), edge: rgba(c, ghost ? 0.55 : 0.95), faint: rgba(c, 0.3), glowCol: c, pool1: rgba(c, 0.2), pool2: rgba(c, 0.34) };
  styles.set(a, st); return st;
}

export const rgba = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return `rgba(120,220,255,${a})`;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export const hueColor = (h: number, l = 60): string => `hsl(${h},85%,${l}%)`;

// the nine spikes of a door, in door units: u across (-hw..hw), y up (0..DOOR_H), flat [u0,y0,u1,y1,...]. Same spiral as the door transition.
const BL = 9, TWIST = 1.15, W0 = 0.52, STEPS = 7;
export function spikePolys(hw: number, open: boolean, level?: number): Float64Array[] {
  const cx = 0, cy = DOOR_H / 2, RX = hw * 1.75, RY = cy * 1.55, stop = level ?? (open ? 0.6 : 0.04);
  return Array.from({ length: BL }, (_, i) => {
    const a = (i * Math.PI * 2) / BL - Math.PI / 2, out = new Float64Array((STEPS + 1) * 4);
    for (let k = 0; k <= STEPS; k++) {
      const f = 1 - (k / STEPS) * (1 - stop), w = W0 * Math.pow(f, 0.65), spin = a + TWIST * (1 - f);
      out[k * 2] = cx + RX * f * Math.cos(spin - w); out[k * 2 + 1] = cy + RY * f * Math.sin(spin - w);          // left edge, going in
      const j = (STEPS + 1) * 2 + (STEPS - k) * 2;                                                                 // right edge, coming back out
      out[j] = cx + RX * f * Math.cos(spin + w); out[j + 1] = cy + RY * f * Math.sin(spin + w);
    }
    return out;
  });
}
const SPIKES = { closed: spikePolys(0.85, false), open: spikePolys(0.85, true) };
/** The iris of a door at nine degrees of openness, 0 shut .. 8 wide open (the same petals, pulled back). */
const LEVELS = 8, PETALS: Float64Array[][] = Array.from({ length: LEVELS + 1 }, (_, i) => spikePolys(0.85, false, 0.04 + (0.66 - 0.04) * (i / LEVELS)));
const BG = "#04080c";
const NO_PEOPLE: Shown[] = [];

/** What the painter needs to draw a corridor and the room beyond it. One of these is kept and updated each frame. */
export class ScenePaint {
  link: Link | null = null; open = 0;
  /** The eye is in the corridor (not in the room that owns the link). */
  corridor = false;
  nextPainter: RoomPainter | null = null;
  readonly eye: Eye = { x: 0, z: 0, yaw: 0, pitch: 0 };
}
const FONTS: string[] = []; for (let s = 8; s <= 24; s++) FONTS[s] = `${s}px ui-monospace,Menlo,Consolas,monospace`;
const hueOf = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };
const clampI = (n: number, a: number, b: number): number => (n < a ? a : n > b ? b : Math.round(n));

/** What the visor and the scanner add to a frame: the ping (ring, answers) and the scan in progress (a ring filling round its target). */
export interface FxView { echo: EchoField | null; now: number; scan: { x: number; y: number; z: number; p: number } | null }
export interface DroneView { d: Drone; playing: boolean; title: string; t: number; hit: { x: number; y: number; r: number } | null }
export interface PaintStats { polys: number; ms: number }

const glows = new Map<string, HTMLCanvasElement>();
/** A soft round glow, drawn once per colour and stamped from then on (a gradient per frame is garbage). */
function glow(col: string, a: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = col + a; let c = glows.get(key); if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); if (!g) return null;
  const gr = g.createRadialGradient(32, 32, 7, 32, 32, 32); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glows.set(key, c); return c;
}

export class RoomPainter {
  readonly stats: PaintStats = { polys: 0, ms: 0 };
  private ctx!: CanvasRenderingContext2D; private W = 0; private H = 0; private f = 1;
  // camera, set once per frame
  private ex = 0; private ez = 0; private sy = 0; private cy = 1; private sp = 0; private cp = 1;
  private qx = 0; private qy = 0; private qz = 0;      // result of cam()
  private wp = new Float64Array(3 * 40); private cc = new Float64Array(3 * 80); private cl = new Float64Array(3 * 80);
  private order: Int16Array; private dist: Float64Array; private itemD = new Float64Array(64); private itemI = new Int16Array(64);
  private fd = new Float64Array(4); private fi = new Int8Array(4); private pcx = new Float64Array(4); private pcz = new Float64Array(4);
  private readonly n: number; private readonly v: [number, number][]; private readonly H3: number;
  private C: { floor: string; ceil: string; wallA: string; wallB: string; grid: string; line: string; edge: string; doorOpen: string; doorOpenHot: string; spike: string; spikeStroke: string; doorEdge: string; doorEdgeHot: string; hotFill: string; map: string; mapLine: string; cross: string; scan: string; propHotFill: string };
  private propCol: string[]; private propLabel: string[]; private doorLabel: string[]; private wallLen: number[]; private wallMid: Float64Array;
  private personCol = new Map<string, string>();
  private fx: FxView | null = null;
  private segOrd = new Int16Array(32); private segD = new Float64Array(32);

  constructor(private world: RoomWorld, private color: string) {
    this.n = world.sides; this.v = world.verts; this.H3 = world.H;
    this.order = new Int16Array(this.n); this.dist = new Float64Array(this.n);
    this.C = {
      floor: rgba(color, 0.09), ceil: rgba(color, 0.05), wallA: rgba(color, 0.13), wallB: rgba(color, 0.1), grid: rgba(color, 0.22), line: rgba(color, 0.2), edge: rgba(color, 0.8),
      doorOpen: rgba(color, 0.2), doorOpenHot: rgba(color, 0.34), spike: rgba(color, 0.32), spikeStroke: rgba(color, 0.9), doorEdge: rgba(color, 0.85), doorEdgeHot: rgba(color, 1),
      hotFill: rgba(color, 0.42), map: rgba(color, 0.8), mapLine: rgba(color, 0.8), cross: rgba(color, 0.7), scan: rgba("#9fe9ff", 0.35), propHotFill: rgba(color, 0.28),
    };
    this.propCol = world.props.map((p) => (p.kind === "terminal" ? hueColor(p.hue, 58) : p.kind === "more" ? color : hueColor(p.hue, 62)));
    this.propLabel = world.props.map((p) => (p.kind === "terminal" ? "TALK" : p.label.length > 22 ? p.label.slice(0, 21) + "…" : p.label));
    this.doorLabel = world.doors.map((d) => (d.state === "open" ? d.name ?? "" : "sealed"));
    this.wallLen = []; this.wallMid = new Float64Array(this.n * 2);
    for (let i = 0; i < this.n; i++) { const a = this.v[i], b = this.v[(i + 1) % this.n]; this.wallLen.push(Math.hypot(b[0] - a[0], b[1] - a[1])); this.wallMid[i * 2] = (a[0] + b[0]) / 2; this.wallMid[i * 2 + 1] = (a[1] + b[1]) / 2; }
  }

  // ---- projection primitives (no allocation)
  private cam(x: number, y: number, z: number): void {
    const dx = x - this.ex, dy = y - EYE_Y, dz = z - this.ez;
    const cx = -dx * this.sy + dz * this.cy, cz = dx * this.cy + dz * this.sy;
    this.qx = cx; this.qy = dy * this.cp - cz * this.sp; this.qz = cz * this.cp + dy * this.sp;
  }
  /** The world points in `wp` (n of them) as a screen path, cut at the near plane; false when none is in front. */
  private pm = 0;
  private poly(n: number): boolean {
    const wp = this.wp, cc = this.cc, cl = this.cl;
    for (let i = 0; i < n; i++) { this.cam(wp[i * 3], wp[i * 3 + 1], wp[i * 3 + 2]); cc[i * 3] = this.qx; cc[i * 3 + 1] = this.qy; cc[i * 3 + 2] = this.qz; }
    let m = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, az = cc[i * 3 + 2], bz = cc[j * 3 + 2], ain = az >= NEAR, bin = bz >= NEAR;
      if (ain) { cl[m * 3] = cc[i * 3]; cl[m * 3 + 1] = cc[i * 3 + 1]; cl[m * 3 + 2] = az; m++; }
      if (ain !== bin) { const t = (NEAR - az) / (bz - az); cl[m * 3] = cc[i * 3] + (cc[j * 3] - cc[i * 3]) * t; cl[m * 3 + 1] = cc[i * 3 + 1] + (cc[j * 3 + 1] - cc[i * 3 + 1]) * t; cl[m * 3 + 2] = NEAR; m++; }
    }
    if (m < 3) return false;
    this.pm = m;
    const ctx = this.ctx, hw = this.W / 2, hh = this.H / 2, f = this.f; ctx.beginPath();
    for (let i = 0; i < m; i++) { const z = cl[i * 3 + 2], x = hw + (cl[i * 3] * f) / z, y = hh - (cl[i * 3 + 1] * f) / z; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); this.stats.polys++; return true;
  }
  private quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): boolean {
    const w = this.wp; w[0] = ax; w[1] = ay; w[2] = az; w[3] = bx; w[4] = by; w[5] = bz; w[6] = cx; w[7] = cy; w[8] = cz; w[9] = dx; w[10] = dy; w[11] = dz; return this.poly(4);
  }
  /** One line into the current path, cut at the near plane. */
  private seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.cam(ax, ay, az); let x1 = this.qx, y1 = this.qy, z1 = this.qz;
    this.cam(bx, by, bz); let x2 = this.qx, y2 = this.qy, z2 = this.qz;
    if (z1 < NEAR && z2 < NEAR) return;
    if (z1 < NEAR) { const t = (NEAR - z1) / (z2 - z1); x1 += (x2 - x1) * t; y1 += (y2 - y1) * t; z1 = NEAR; }
    else if (z2 < NEAR) { const t = (NEAR - z2) / (z1 - z2); x2 += (x1 - x2) * t; y2 += (y1 - y2) * t; z2 = NEAR; }
    const hw = this.W / 2, hh = this.H / 2, f = this.f;
    this.ctx.moveTo(hw + (x1 * f) / z1, hh - (y1 * f) / z1); this.ctx.lineTo(hw + (x2 * f) / z2, hh - (y2 * f) / z2);
  }
  private text(s: string, x: number, y: number, size: number, fill: string): void {
    const c = this.ctx; c.font = FONTS[clampI(size, 8, 24)]; c.textAlign = "center"; c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,.8)"; c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y);
  }

  /** Camera for this frame. */
  view(ctx: CanvasRenderingContext2D, W: number, H: number, eye: Eye): void {
    this.ctx = ctx; this.W = W; this.H = H; this.f = focalOf(W, H); this.stats.polys = 0;
    this.ex = eye.x; this.ez = eye.z; this.sy = Math.sin(eye.yaw); this.cy = Math.cos(eye.yaw); this.sp = Math.sin(eye.pitch); this.cp = Math.cos(eye.pitch);
  }

  paint(ctx: CanvasRenderingContext2D, W: number, H: number, eye: Eye, target: Target | null, others: Shown[], drone: DroneView | null, lock: Lock | null, sp: ScenePaint | null = null, fx: FxView | null = null): PaintStats {
    this.view(ctx, W, H, eye); this.fx = fx;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    if (sp && sp.link && sp.corridor) this.corridorView(eye, sp);
    else { this.tilesLeft = actorLayer.budget; this.shell(eye, -1, target, sp && sp.link ? sp : null); this.floorPaint(eye); this.ceilPaint(eye); this.actors(eye); this.things(eye, target, others); this.grade(); }
    if (fx?.echo) this.echo(fx.echo, fx.now);
    if (lock) this.bracket(lock);
    if (fx?.scan && fx.scan.p > 0) this.scanRing(fx.scan);
    if (drone) this.drone(drone, eye);
    this.map(eye, sp && sp.link ? sp.link : null);
    ctx.strokeStyle = this.C.cross; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 7, H / 2); ctx.lineTo(W / 2 + 7, H / 2); ctx.moveTo(W / 2, H / 2 - 7); ctx.lineTo(W / 2, H / 2 + 7); ctx.stroke();
    return this.stats;
  }

  /** Floor, ceiling and walls with their doors. `skip` is a wall not to draw (the one you are looking through from the other side). */
  shell(eye: Eye, skip: number, target: Target | null, sp: ScenePaint | null): void {
    const { n, v, world, C, ctx } = this, Hh = this.H3;
    // ceiling and floor
    for (let i = 0; i < n; i++) { this.wp[i * 3] = v[i][0]; this.wp[i * 3 + 1] = Hh; this.wp[i * 3 + 2] = v[i][1]; }
    if (this.poly(n)) { ctx.fillStyle = C.ceil; ctx.fill(); }
    for (let i = 0; i < n; i++) { this.wp[i * 3 + 1] = 0; }
    if (this.poly(n)) { ctx.fillStyle = C.floor; ctx.fill(); }
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n];
      this.seg(a[0] * 0.34, 0, a[1] * 0.34, b[0] * 0.34, 0, b[1] * 0.34); this.seg(a[0] * 0.67, 0, a[1] * 0.67, b[0] * 0.67, 0, b[1] * 0.67);
      this.seg(a[0] * 0.12, 0, a[1] * 0.12, a[0], 0, a[1]); this.seg(a[0] * 0.6, Hh, a[1] * 0.6, b[0] * 0.6, Hh, b[1] * 0.6);
    }
    ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.stroke();

    // walls, far to near (insertion sort of a handful of indices)
    for (let i = 0; i < n; i++) { const dx = this.wallMid[i * 2] - eye.x, dz = this.wallMid[i * 2 + 1] - eye.z; this.dist[i] = dx * dx + dz * dz; let j = i; while (j > 0 && this.dist[this.order[j - 1]] < this.dist[i]) { this.order[j] = this.order[j - 1]; j--; } this.order[j] = i; }
    for (let oi = 0; oi < n; oi++) {
      const i = this.order[oi]; if (i === skip) continue;
      const a = v[i], b = v[(i + 1) % n], near = this.dist[i] < 256;
      if (this.quad(a[0], 0, a[1], b[0], 0, b[1], b[0], Hh, b[1], a[0], Hh, a[1])) { ctx.fillStyle = i % 2 ? C.wallB : C.wallA; ctx.fill(); }
      if (actorLayer.doc?.bands.length) this.bands(i, eye);
      ctx.beginPath();
      this.seg(a[0], 0.35, a[1], b[0], 0.35, b[1]); this.seg(a[0], Hh - 0.4, a[1], b[0], Hh - 0.4, b[1]);
      if (near) { const cols = Math.max(2, Math.round(this.wallLen[i] / 1.8)); for (let c = 1; c < cols; c++) { const t = c / cols, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; this.seg(x, 0.35, z, x, Hh - 0.4, z); } }
      ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.beginPath(); this.seg(a[0], 0, a[1], a[0], Hh, a[1]); ctx.lineWidth = 2; ctx.strokeStyle = C.edge; ctx.stroke();
      for (let di = 0; di < world.doors.length; di++) if (world.doors[di].edge === i) this.door(di, eye, target?.kind === "door" && target.door.id === world.doors[di].id, sp);
    }
  }

  // ---- the painted floor: flat colour for every painted rectangle, then textured tiles near the eye until the budget is spent
  /** The sky: the ceiling becomes an open view. One wide picture, sampled by direction, turning `speed` degrees a second and wrapping round (two draws at most per frame). */
  private skyPaint(eye: Eye, sky: { id: number; speed: number }): void {
    const ctx = this.ctx, n = this.n, v = this.v, Hh = this.H3, img = skyImage(sky.id);
    for (let i = 0; i < n; i++) { this.wp[i * 3] = v[i][0]; this.wp[i * 3 + 1] = Hh; this.wp[i * 3 + 2] = v[i][1]; }
    if (!this.poly(n)) { actorLayer.skySeen = false; return; }
    { const hh = this.H / 2, f = this.f, cl = this.cl; let top = 1e9, bot = -1e9; for (let i = 0; i < this.pm; i++) { const y = hh - (cl[i * 3 + 1] * f) / cl[i * 3 + 2]; if (y < top) top = y; if (y > bot) bot = y; } actorLayer.skySeen = bot > 0 && top < this.H; }
    if (!actorLayer.skySeen) { this.ctx.beginPath(); return; }
    ctx.save(); ctx.clip(); ctx.fillStyle = "#05060c"; ctx.fillRect(0, 0, this.W, this.H);
    if (img) {
      const W = this.W, H = this.H, f = this.f, iw = img.naturalWidth, ih = img.naturalHeight, TAU = Math.PI * 2;
      const ha = Math.atan(W / 2 / f), va = Math.atan(H / 2 / f), yaw = eye.yaw + (sky.speed * Math.PI / 180) * actorLayer.now;
      let u0 = (yaw - ha) / TAU; u0 -= Math.floor(u0);
      const sw = (2 * ha / TAU) * iw, sx = u0 * iw;
      const top = eye.pitch + va, bot = eye.pitch - va; // elevations of the screen's top and bottom edge
      let sy0 = (0.5 - top / Math.PI) * ih, sy1 = (0.5 - bot / Math.PI) * ih, dy0 = 0, dy1 = H;
      if (sy0 < 0) { dy0 = (-sy0 / (sy1 - sy0)) * H; sy0 = 0; } if (sy1 > ih) { dy1 = H - ((sy1 - ih) / (sy1 - (0.5 - top / Math.PI) * ih)) * H; sy1 = ih; }
      const sh = sy1 - sy0, dh = dy1 - dy0;
      if (sh > 0 && dh > 0) {
        const first = Math.min(sw, iw - sx), dw = (first / sw) * W;
        ctx.drawImage(img, sx, sy0, first, sh, 0, dy0, dw, dh);
        if (first < sw) ctx.drawImage(img, 0, sy0, sw - first, sh, dw, dy0, W - dw, dh);
      }
    }
    ctx.restore();
  }
  private ceilCells: { x: number; z: number }[] | null = null; private ceilKey = "";
  /** The ceiling: one material over the whole of it, flat first and then tiles overhead while half of what is left of the budget lasts. */
  private ceilPaint(eye: Eye): void {
    const L = actorLayer, doc = L.doc; if (!doc || L.slug !== this.world.slug) return;
    if (doc.sky) { this.skyPaint(eye, doc.sky); return; }
    if (!doc.ceil) return;
    const t = doc.tex[doc.ceil - 1]; if (!t) return;
    const ctx = this.ctx, n = this.n, v = this.v, Hh = this.H3;
    for (let i = 0; i < n; i++) { this.wp[i * 3] = v[i][0]; this.wp[i * 3 + 1] = Hh; this.wp[i * 3 + 2] = v[i][1]; }
    if (!this.poly(n)) return;
    ctx.save(); ctx.clip(); ctx.fillStyle = this.flatOf(t.kind, t.tint); ctx.fillRect(0, 0, this.W, this.H);
    const sheet = texSheet(t.kind, t.tint), s = Math.min(1, t.scale);
    if (sheet && this.tilesLeft > L.budget / 2) {
      const key = s + ":" + t.scale; if (!this.ceilCells || this.ceilKey !== key) {
        this.ceilKey = key; const cells: { x: number; z: number }[] = []; let m = 0; for (const p of v) m = Math.max(m, Math.abs(p[0]), Math.abs(p[1]));
        for (let x = -Math.ceil(m / s) * s; x < m; x += s) for (let z = -Math.ceil(m / s) * s; z < m; z += s) if (inRoom(this.world, x + s / 2, z + s / 2)) cells.push({ x, z });
        this.ceilCells = cells;
      }
      const base = ctx.getTransform().a, hw = this.W / 2, hh = this.H / 2, f = this.f, T = sheetTile(sheet); let left = Math.floor(this.tilesLeft - L.budget / 2);
      for (const c of this.ceilCells!) {
        const cx = c.x + s / 2 - eye.x, cz = c.z + s / 2 - eye.z; if (cx * cx + cz * cz > 100) continue;
        this.cam(c.x, Hh, c.z); if (this.qz < NEAR) continue; const ax = hw + (this.qx * f) / this.qz, ay = hh - (this.qy * f) / this.qz;
        this.cam(c.x + s, Hh, c.z); if (this.qz < NEAR) continue; const bx = hw + (this.qx * f) / this.qz, by = hh - (this.qy * f) / this.qz;
        this.cam(c.x, Hh, c.z + s); if (this.qz < NEAR) continue; const dx = hw + (this.qx * f) / this.qz, dy = hh - (this.qy * f) / this.qz;
        ctx.setTransform(base * (bx - ax), base * (by - ay), base * (dx - ax), base * (dy - ay), base * ax, base * ay);
        ctx.drawImage(sheet, frac((c.x + t.scroll * L.now) / t.scale) * T, frac(c.z / t.scale) * T, (T * s) / t.scale, (T * s) / t.scale, 0, 0, 1, 1);
        this.tilesLeft--; if (--left <= 0) break;
      }
      ctx.setTransform(base, 0, 0, base, 0, 0);
    }
    ctx.restore();
  }
  private flatCol = new Map<string, string>(); private tilesLeft = 0;
  private flatOf(kind: string, tint: string): string { const a = texAvg(kind); if (a) return a; let c = this.flatCol.get(tint); if (!c) { c = rgba(tint, 0.2); this.flatCol.set(tint, c); } return c; }
  /** Strips of texture on wall `i`: a flat tint for the whole strip, then tiles of up to 1 m within 12 m while the budget lasts (walls take at most half of it). */
  private bands(i: number, eye: Eye): void {
    const L = actorLayer, doc = L.doc; if (!doc || L.slug !== this.world.slug) return;
    const a = this.v[i], b = this.v[(i + 1) % this.n], len = this.wallLen[i], ctx = this.ctx, dx = b[0] - a[0], dz = b[1] - a[1], hw = this.W / 2, hh = this.H / 2, f = this.f;
    for (const bd of doc.bands) {
      if (bd.e !== i) continue; const t = doc.tex[bd.m - 1]; if (!t) continue;
      const x0 = a[0] + dx * bd.u0, z0 = a[1] + dz * bd.u0, x1 = a[0] + dx * bd.u1, z1 = a[1] + dz * bd.u1;
      const col = this.flatOf(t.kind, t.tint);
      if (this.quad(x0, bd.y0, z0, x1, bd.y0, z1, x1, bd.y1, z1, x0, bd.y1, z0)) { ctx.fillStyle = col; ctx.fill(); }
      const mx = (x0 + x1) / 2 - eye.x, mz = (z0 + z1) / 2 - eye.z;
      if (this.tilesLeft <= L.budget / 2 || mx * mx + mz * mz > 144) continue;
      const sheet = texSheet(t.kind, t.tint); if (!sheet) continue;
      const span = (bd.u1 - bd.u0) * len, H = bd.y1 - bd.y0, s = Math.min(1, t.scale), nx = Math.ceil(span / s), ny = Math.ceil(H / s); if (nx * ny > 70) continue;
      const base = ctx.getTransform().a;
      for (let kx = 0; kx < nx; kx++) {
        const w = Math.min(s, span - kx * s), uA = bd.u0 * len + kx * s, fa = uA / len, fb = (uA + w) / len;
        for (let ky = 0; ky < ny; ky++) {
          const h = Math.min(s, H - ky * s), top = bd.y1 - ky * s;
          this.cam(a[0] + dx * fa, top, a[1] + dz * fa); if (this.qz < NEAR) continue; const px = hw + (this.qx * f) / this.qz, py = hh - (this.qy * f) / this.qz;
          this.cam(a[0] + dx * fb, top, a[1] + dz * fb); if (this.qz < NEAR) continue; const rx = hw + (this.qx * f) / this.qz, ry = hh - (this.qy * f) / this.qz;
          this.cam(a[0] + dx * fa, top - h, a[1] + dz * fa); if (this.qz < NEAR) continue; const qx = hw + (this.qx * f) / this.qz, qy = hh - (this.qy * f) / this.qz;
          const T = sheetTile(sheet), sx = frac((uA + (t.scroll * L.now)) / t.scale) * T, sy = frac(-top / t.scale) * T;
          ctx.setTransform(base * (rx - px), base * (ry - py), base * (qx - px), base * (qy - py), base * px, base * py);
          ctx.drawImage(sheet, sx, sy, (T * w) / t.scale, (T * h) / t.scale, 0, 0, 1, 1);
          this.tilesLeft--;
        }
      }
      ctx.setTransform(base, 0, 0, base, 0, 0);
    }
  }
  private fogImg: HTMLCanvasElement | null = null; private fogKey = "";
  /** The room's mood: a colour veil, then a fog band across the horizon (one cached gradient stamped once). */
  private grade(): void {
    const L = actorLayer, g = L.doc?.grade; if (!g || L.slug !== this.world.slug) return;
    const ctx = this.ctx;
    if (g.fogD > 0 && typeof document !== "undefined") {
      const key = g.fog + g.fogD; if (key !== this.fogKey || !this.fogImg) {
        const c = this.fogImg ?? document.createElement("canvas"); c.width = 4; c.height = 128; const gg = c.getContext("2d");
        if (gg) { const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, rgba(g.fog, 0)); gr.addColorStop(0.5, rgba(g.fog, Math.min(0.85, g.fogD * 0.7))); gr.addColorStop(1, rgba(g.fog, 0)); gg.clearRect(0, 0, 4, 128); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128); }
        this.fogImg = c; this.fogKey = key;
      }
      const hy = Math.max(-this.H, Math.min(2 * this.H, this.H / 2 + (this.f * this.sp) / Math.max(0.2, this.cp))), bh = this.H * 1.3;
      ctx.drawImage(this.fogImg, 0, hy - bh / 2, this.W, bh);
    }
    if (g.tintA > 0) { ctx.globalAlpha = g.tintA; ctx.fillStyle = g.tint; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1; }
  }
  floorPaint(eye: Eye): void {
    const L = actorLayer, fl = L.floor; if (!fl || L.slug !== this.world.slug) return;
    const ctx = this.ctx, n = this.n, v = this.v;
    for (let i = 0; i < n; i++) { this.wp[i * 3] = v[i][0]; this.wp[i * 3 + 1] = 0; this.wp[i * 3 + 2] = v[i][1]; }
    if (!this.poly(n)) return;
    ctx.save(); ctx.clip();                     // paint never leaves the room's own floor
    for (const r of fl.rects) {
      const t = fl.tex[r.t - 1]; if (!t) continue;
      const col = this.flatOf(t.kind, t.tint);
      if (this.quad(r.x0, 0, r.z0, r.x1, 0, r.z0, r.x1, 0, r.z1, r.x0, 0, r.z1)) { ctx.fillStyle = col; ctx.fill(); }
    }
    let budget = this.tilesLeft; if (budget <= 0) { ctx.restore(); return; }
    const base = ctx.getTransform().a, R2 = 100, hw = this.W / 2, hh = this.H / 2, f = this.f;
    // screen position of three corners of each block (cam() is the only projection used)
    for (const b of fl.blocks) {
      const cx = b.x + b.s / 2 - eye.x, cz = b.z + b.s / 2 - eye.z;
      if (cx * cx + cz * cz > R2) continue;
      const t = fl.tex[b.t - 1]; if (!t) continue;
      const sheet = texSheet(t.kind, t.tint); if (!sheet) continue;
      this.cam(b.x, 0, b.z); if (this.qz < NEAR) continue; const ax = hw + (this.qx * f) / this.qz, ay = hh - (this.qy * f) / this.qz;
      this.cam(b.x + b.s, 0, b.z); if (this.qz < NEAR) continue; const bx = hw + (this.qx * f) / this.qz, by = hh - (this.qy * f) / this.qz;
      this.cam(b.x, 0, b.z + b.s); if (this.qz < NEAR) continue; const dx = hw + (this.qx * f) / this.qz, dy = hh - (this.qy * f) / this.qz;
      this.cam(b.x + b.s, 0, b.z + b.s); if (this.qz < NEAR) continue;
      const T = sheetTile(sheet), u = frac(b.x / t.scale + (t.scroll * L.now) / t.scale) * T, v = frac(b.z / t.scale) * T, sw = (T * b.s) / t.scale;
      ctx.setTransform(base * (bx - ax), base * (by - ay), base * (dx - ax), base * (dy - ay), base * ax, base * ay);
      ctx.drawImage(sheet, u, v, sw, sw, 0, 0, 1, 1);
      if (--budget <= 0) break;
    }
    this.tilesLeft = budget;
    ctx.setTransform(base, 0, 0, base, 0, 0); ctx.restore();
  }

  // ---- what the owner built (solids, ghosts, lights; in edit mode also triggers and markers)
  private fv = new Float64Array(16); private aOrd = new Int16Array(160); private aD = new Float64Array(160);
  actors(eye: Eye): void {
    const L = actorLayer; if (!L.doc || !L.rt || L.slug !== this.world.slug) return;
    const acts = L.doc.actors, rt = L.rt; let m = 0;
    for (let i = 0; i < acts.length && i < 160; i++) {
      const a = acts[i]; if (!L.edit && (a.kind === "trigger" || a.kind === "marker" || !rt.isOn(a.id))) continue;
      const d = (a.x - eye.x) * (a.x - eye.x) + (a.z - eye.z) * (a.z - eye.z);
      let j = m; while (j > 0 && this.aD[j - 1] < d) { this.aD[j] = this.aD[j - 1]; this.aOrd[j] = this.aOrd[j - 1]; j--; } this.aD[j] = d; this.aOrd[j] = i; m++;
    }
    const ctx = this.ctx;
    for (let q = 0; q < m; q++) {
      const a = acts[this.aOrd[q]], on = rt.isOn(a.id), sel = L.edit && L.sel === a.id;
      if (L.edit && !on) ctx.globalAlpha = 0.35;
      if (a.kind === "solid" || a.kind === "ghost") this.prism(a, eye, sel);
      else if (a.kind === "light") this.lamp(a, sel);
      else if (a.kind === "pool") this.pool(a, sel);
      else this.marker(a, eye, sel);
      if (L.edit && !on) ctx.globalAlpha = 1;
    }
  }
  private footprint(a: Actor): number {
    const v = this.fv;
    if (a.sides >= 3) { const r = Math.min(a.w, a.d) / 2; for (let k = 0; k < a.sides; k++) { const t = a.rot + (k * Math.PI * 2) / a.sides; v[k * 2] = a.x + Math.cos(t) * r; v[k * 2 + 1] = a.z + Math.sin(t) * r; } return a.sides; }
    const c = Math.cos(a.rot), s = Math.sin(a.rot), hx = a.w / 2, hz = a.d / 2;
    v[0] = a.x - hx * c + hz * s; v[1] = a.z - hx * s - hz * c; v[2] = a.x + hx * c + hz * s; v[3] = a.z + hx * s - hz * c;
    v[4] = a.x + hx * c - hz * s; v[5] = a.z + hx * s + hz * c; v[6] = a.x - hx * c - hz * s; v[7] = a.z - hx * s + hz * c; return 4;
  }
  private prism(a: Actor, eye: Eye, sel: boolean): void {
    const st = styleOf(a), n = this.footprint(a), v = this.fv, ctx = this.ctx, h = a.h;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, mx = (v[i * 2] + v[j * 2]) / 2, mz = (v[i * 2 + 1] + v[j * 2 + 1]) / 2;
      if ((mx - a.x) * (eye.x - mx) + (mz - a.z) * (eye.z - mz) <= 0) continue; // faces away
      if (this.quad(v[i * 2], 0, v[i * 2 + 1], v[j * 2], 0, v[j * 2 + 1], v[j * 2], h, v[j * 2 + 1], v[i * 2], h, v[i * 2 + 1])) { ctx.fillStyle = i % 2 ? st.b : st.a; ctx.fill(); ctx.lineWidth = sel ? 2.5 : 1.2; ctx.strokeStyle = sel ? "#ffffff" : st.edge; ctx.stroke(); }
    }
    if (h < EYE_Y) { for (let i = 0; i < n; i++) { this.wp[i * 3] = v[i * 2]; this.wp[i * 3 + 1] = h; this.wp[i * 3 + 2] = v[i * 2 + 1]; } if (this.poly(n)) { ctx.fillStyle = st.top; ctx.fill(); ctx.lineWidth = sel ? 2.5 : 1.2; ctx.strokeStyle = sel ? "#ffffff" : st.edge; ctx.stroke(); } }
  }
  private lamp(a: Actor, sel: boolean): void {
    this.cam(a.x, Math.max(0.4, a.h), a.z); if (this.qz < NEAR) return;
    const x = this.W / 2 + (this.qx * this.f) / this.qz, y = this.H / 2 - (this.qy * this.f) / this.qz, size = Math.min(this.W, (Math.max(a.w, a.d) * 4 * this.f) / this.qz);
    const g = glow(a.color, 0.55), keep = this.ctx.globalAlpha; if (a.pulse > 0) this.ctx.globalAlpha = Math.min(1, keep * (0.75 + 0.25 * Math.sin(actorLayer.now * Math.PI * 2 * a.pulse) + 0.25));
    if (g && size > 2) this.ctx.drawImage(g, x - size / 2, y - size / 2, size, size);
    this.ctx.globalAlpha = keep;
    if (this.ctx.globalAlpha < 1 || sel) { this.ctx.strokeStyle = sel ? "#ffffff" : styleOf(a).edge; this.ctx.lineWidth = 1.5; this.ctx.strokeRect(x - 5, y - 5, 10, 10); }
  }
  /** A pool of light on the floor: two soft discs, optionally swelling slowly (never flashing). */
  private pool(a: Actor, sel: boolean): void {
    const st = styleOf(a), ctx = this.ctx, keep = ctx.globalAlpha, r = Math.max(a.w, a.d) / 2;
    if (a.pulse > 0) ctx.globalAlpha = Math.min(1, keep * (0.8 + 0.2 * Math.sin(actorLayer.now * Math.PI * 2 * a.pulse)));
    for (let pass = 0; pass < 2; pass++) {
      const rr = pass ? r * 0.55 : r;
      for (let k = 0; k < 16; k++) { const t = (k * Math.PI * 2) / 16; this.wp[k * 3] = a.x + Math.cos(t) * rr; this.wp[k * 3 + 1] = 0.02; this.wp[k * 3 + 2] = a.z + Math.sin(t) * rr; }
      if (this.poly(16)) { ctx.fillStyle = pass ? st.pool2 : st.pool1; ctx.fill(); if (sel && !pass) { ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke(); } }
    }
    ctx.globalAlpha = keep;
  }
  /** Triggers (a footprint on the floor with posts) and markers (a post with a diamond). Only drawn in edit mode. */
  private marker(a: Actor, eye: Eye, sel: boolean): void {
    const st = styleOf(a), ctx = this.ctx; ctx.strokeStyle = sel ? "#ffffff" : st.edge; ctx.lineWidth = sel ? 2.5 : 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    if (a.kind === "trigger") {
      const n = this.footprint(a), v = this.fv;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.seg(v[i * 2], 0.03, v[i * 2 + 1], v[j * 2], 0.03, v[j * 2 + 1]); this.seg(v[i * 2], 0.03, v[i * 2 + 1], v[i * 2], Math.min(a.h, 2.5), v[i * 2 + 1]); }
    } else { this.seg(a.x, 0, a.z, a.x, 1.6, a.z); this.seg(a.x - 0.25, 1.6, a.z, a.x + 0.25, 1.6, a.z); this.seg(a.x, 1.6, a.z - 0.25, a.x, 1.6, a.z + 0.25); }
    ctx.stroke(); ctx.setLineDash([]);
    this.cam(a.x, a.kind === "trigger" ? 0.6 : 1.9, a.z);
    if (this.qz >= NEAR) { const x = this.W / 2 + (this.qx * this.f) / this.qz, y = this.H / 2 - (this.qy * this.f) / this.qz; this.text(a.name, x, y, Math.min(16, (0.16 * this.f) / this.qz), st.edge); }
  }

  /** The things in the room, far to near: terminals (pedestal with a leaning screen) and the other people. */
  things(eye: Eye, target: Target | null, others: Shown[]): void {
    const world = this.world, np = world.props.length, no = Math.min(others.length, 64 - np);
    if (world.plaque) this.plaque(eye);
    let m = 0;
    for (let k = 0; k < np + no; k++) {
      const x = k < np ? world.props[k].x : others[k - np].x, z = k < np ? world.props[k].z : others[k - np].z, d = Math.hypot(x - eye.x, z - eye.z);
      let j = m; while (j > 0 && this.itemD[j - 1] < d) { this.itemD[j] = this.itemD[j - 1]; this.itemI[j] = this.itemI[j - 1]; j--; } this.itemD[j] = d; this.itemI[j] = k; m++;
    }
    for (let q = 0; q < m; q++) {
      const k = this.itemI[q];
      if (k >= np) { this.person(others[k - np], eye); continue; }
      this.prop(k, this.itemD[q], eye, target?.kind === "prop" && target.prop.id === world.props[k].id);
    }
  }

  /** The inscription: a lit panel on the wall with a few lines of "writing". */
  private plaque(eye: Eye): void {
    const p = this.world.plaque!, ctx = this.ctx, hw = 0.85, y0 = 1.1, y1 = 2.1, ix = -p.nx * 0.02, iz = -p.nz * 0.02;
    const ax = p.x - p.tx * hw + ix, az = p.z - p.tz * hw + iz, bx = p.x + p.tx * hw + ix, bz = p.z + p.tz * hw + iz;
    if (!this.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az)) return;
    ctx.fillStyle = "rgba(255,157,60,.10)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,157,60,.8)"; ctx.stroke();
    if (Math.hypot(p.x - eye.x, p.z - eye.z) < 14) {
      ctx.beginPath();
      for (let l = 0; l < 5; l++) { const y = y1 - 0.14 - l * 0.17, w = hw * (l === 4 ? 0.5 : 0.82 - (l % 2) * 0.12); this.seg(p.x - p.tx * w + ix, y, p.z - p.tz * w + iz, p.x + p.tx * w + ix, y, p.z + p.tz * w + iz); }
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,157,60,.55)"; ctx.stroke();
    }
  }

  // ---- corridors
  /** Clip to a door's opening in this painter's frame, with (ox,oz) added to the door's place, and blank it so what is drawn inside hides the wall. */
  private clipDoor(d: RoomDoor, ox: number, oz: number): boolean {
    const hw = d.hw, ix = -d.nx * 0.03, iz = -d.nz * 0.03, ax = ox + d.x - d.tx * hw + ix, az = oz + d.z - d.tz * hw + iz, bx = ox + d.x + d.tx * hw + ix, bz = oz + d.z + d.tz * hw + iz;
    if (!this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az)) return false;
    this.ctx.save(); this.ctx.clip(); this.ctx.fillStyle = BG; this.ctx.fillRect(0, 0, this.W, this.H); return true;
  }
  /** The room at the far end of the corridor, seen through its door. */
  private beyond(sp: ScenePaint, eye: Eye): void {
    const L = sp.link!, np = sp.nextPainter; if (!np) return;
    if (!this.clipDoor(L.back, L.offx, L.offz)) return;
    const e = sp.eye; e.x = eye.x - L.offx; e.z = eye.z - L.offz; e.yaw = eye.yaw; e.pitch = eye.pitch;
    np.view(this.ctx, this.W, this.H, e); np.shell(e, L.back.edge, null, null);
    if (Math.hypot(e.x, e.z) < 22) np.things(e, null, NO_PEOPLE);
    this.stats.polys += np.stats.polys; this.ctx.restore();
  }
  /** Eye in the corridor: the corridor, then the room behind (through its door) and the room ahead. */
  private corridorView(eye: Eye, sp: ScenePaint): void {
    const L = sp.link!;
    this.corridorShell(L, eye, true);
    if (this.clipDoor(L.door, 0, 0)) { this.shell(eye, L.door.edge, null, null); this.things(eye, null, NO_PEOPLE); this.ctx.restore(); }
    this.beyond(sp, eye);
  }
  /** The corridor: floor, ceiling and two walls for each stretch (far to near), and the end walls with the doors cut out. */
  private corridorShell(L: Link, eye: Eye, capNear: boolean): void {
    const c = L.c, ns = Math.min(c.n - 1, 30), ctx = this.ctx, C = this.C, P = c.pts, A = c.left, B = c.right, CH = CORR_H;
    for (let i = 0; i < ns; i++) { const dx = (P[i * 2] + P[i * 2 + 2]) / 2 - eye.x, dz = (P[i * 2 + 1] + P[i * 2 + 3]) / 2 - eye.z; this.segD[i] = dx * dx + dz * dz; let j = i; while (j > 0 && this.segD[this.segOrd[j - 1]] < this.segD[i]) { this.segOrd[j] = this.segOrd[j - 1]; j--; } this.segOrd[j] = i; }
    for (let oi = 0; oi < ns; oi++) {
      const i = this.segOrd[oi], near = this.segD[i] < 200, a0x = A[i * 2], a0z = A[i * 2 + 1], a1x = A[i * 2 + 2], a1z = A[i * 2 + 3], b0x = B[i * 2], b0z = B[i * 2 + 1], b1x = B[i * 2 + 2], b1z = B[i * 2 + 3];
      if (this.quad(a0x, 0, a0z, b0x, 0, b0z, b1x, 0, b1z, a1x, 0, a1z)) { ctx.fillStyle = C.floor; ctx.fill(); }
      if (this.quad(a0x, CH, a0z, b0x, CH, b0z, b1x, CH, b1z, a1x, CH, a1z)) { ctx.fillStyle = C.ceil; ctx.fill(); }
      if (this.quad(a0x, 0, a0z, a1x, 0, a1z, a1x, CH, a1z, a0x, CH, a0z)) { ctx.fillStyle = C.wallA; ctx.fill(); }
      if (this.quad(b0x, 0, b0z, b1x, 0, b1z, b1x, CH, b1z, b0x, CH, b0z)) { ctx.fillStyle = C.wallB; ctx.fill(); }
      ctx.beginPath();
      this.seg(a0x, 0.35, a0z, a1x, 0.35, a1z); this.seg(a0x, CH - 0.4, a0z, a1x, CH - 0.4, a1z); this.seg(b0x, 0.35, b0z, b1x, 0.35, b1z); this.seg(b0x, CH - 0.4, b0z, b1x, CH - 0.4, b1z);
      this.seg(P[i * 2], CH, P[i * 2 + 1], P[i * 2 + 2], CH, P[i * 2 + 3]);   // the ceiling light
      this.seg(P[i * 2], 0, P[i * 2 + 1], P[i * 2 + 2], 0, P[i * 2 + 3]);       // a stripe down the floor
      if (near) {
        const len = c.cum[i + 1] - c.cum[i], ribs = Math.max(1, Math.round(len / 2.2));
        for (let r = 1; r < ribs; r++) { const t = r / ribs; this.seg(a0x + (a1x - a0x) * t, 0.35, a0z + (a1z - a0z) * t, a0x + (a1x - a0x) * t, CH - 0.4, a0z + (a1z - a0z) * t); this.seg(b0x + (b1x - b0x) * t, 0.35, b0z + (b1z - b0z) * t, b0x + (b1x - b0x) * t, CH - 0.4, b0z + (b1z - b0z) * t); }
      }
      ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.beginPath(); this.seg(a1x, 0, a1z, a1x, CH, a1z); this.seg(b1x, 0, b1z, b1x, CH, b1z); ctx.lineWidth = 2; ctx.strokeStyle = C.edge; ctx.stroke();
    }
    this.cap(L.c, 0, L.door, capNear); this.cap(L.c, c.n - 1, L.back, true);
  }
  /** The wall across the end of the corridor, with the door cut out of it. */
  private cap(c: Corridor, i: number, d: RoomDoor, draw: boolean): void {
    if (!draw) return;
    const ctx = this.ctx, CH = CORR_H, lx = c.left[i * 2], lz = c.left[i * 2 + 1], rx = c.right[i * 2], rz = c.right[i * 2 + 1], px = c.pts[i * 2], pz = c.pts[i * 2 + 1];
    const L = Math.hypot(lx - rx, lz - rz) || 1, tx = (lx - rx) / L, tz = (lz - rz) / L, ax = px + tx * d.hw, az = pz + tz * d.hw, bx = px - tx * d.hw, bz = pz - tz * d.hw;
    ctx.fillStyle = this.C.wallB;
    if (this.quad(lx, 0, lz, ax, 0, az, ax, CH, az, lx, CH, lz)) ctx.fill();
    if (this.quad(bx, 0, bz, rx, 0, rz, rx, CH, rz, bx, CH, bz)) ctx.fill();
    if (this.quad(ax, DOOR_H, az, bx, DOOR_H, bz, bx, CH, bz, ax, CH, az)) ctx.fill();
  }

  private door(di: number, e: Eye, hot: boolean, sp: ScenePaint | null): void {
    const ctx = this.ctx, d = this.world.doors[di], C = this.C, open = d.state === "open", ox = -d.nx * 0.03, oz = -d.nz * 0.03, hw = d.hw;
    const ax = d.x - d.tx * hw + ox, az = d.z - d.tz * hw + oz, bx = d.x + d.tx * hw + ox, bz = d.z + d.tz * hw + oz;
    const dist = Math.hypot(d.x - e.x, d.z - e.z), linked = !!sp && !!sp.link && sp.link.door.id === d.id && sp.open > 0.02;
    if (!this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az)) return;
    ctx.fillStyle = open ? (hot ? C.doorOpenHot : C.doorOpen) : "rgba(8,14,20,.9)"; ctx.fill();
    // a door that is opening shows the corridor behind it
    if (linked && this.clipDoor(d, 0, 0)) { this.corridorShell(sp!.link!, e, false); this.beyond(sp!, e); ctx.restore(); }
    // the iris: shut for a door that leads somewhere or is sealed, pulled back as it opens. Only when all four corners are in front and the door is near.
    let allFront = dist < 16;
    if (allFront) for (let k = 0; k < 4 && allFront; k++) { this.cam(k & 1 ? bx : ax, k > 1 ? DOOR_H : 0, k & 1 ? bz : az); if (this.qz < NEAR) allFront = false; }
    if (allFront) {
      ctx.save(); this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az); ctx.clip();
      const set = linked ? PETALS[Math.max(0, Math.min(LEVELS, Math.round(sp!.open * LEVELS)))] : open ? PETALS[0] : SPIKES.closed, hwid = this.W / 2, hh = this.H / 2, f = this.f;
      ctx.fillStyle = open ? C.spike : "rgba(70,95,115,.55)"; ctx.strokeStyle = open ? C.spikeStroke : "rgba(111,135,152,.6)"; ctx.lineWidth = 1;
      for (let s = 0; s < set.length; s++) {
        const pts = set[s]; ctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) { this.cam(d.x + d.tx * pts[k] + ox, pts[k + 1], d.z + d.tz * pts[k] + oz); const x = hwid + (this.qx * f) / this.qz, y = hh - (this.qy * f) / this.qz; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); this.stats.polys++;
      }
      ctx.restore();
    }
    this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az); ctx.lineWidth = hot ? 3.5 : 2; ctx.strokeStyle = open ? (hot ? C.doorEdgeHot : C.doorEdge) : hot ? "rgba(111,135,152,1)" : "rgba(111,135,152,.85)"; ctx.stroke();
    // a sealed door that the ping has reached answers: it lights in its own colour and says its note
    let label = this.doorLabel[di], lcol = open ? this.C.doorEdgeHot : "#8aa0b0";
    const fe = this.fx?.echo;
    if (fe) for (let i = 0; i < fe.n; i++) if (fe.door[i] === di && fe.seal[i]) {
      const g = fe.glow(i, this.fx!.now);
      if (g > 0) { ctx.save(); ctx.globalAlpha = g; ctx.lineWidth = 3 + 4 * g; ctx.strokeStyle = fe.col[i]; ctx.stroke(); ctx.fillStyle = fe.col[i]; ctx.globalAlpha = g * 0.16; ctx.fill(); ctx.restore(); label = fe.note[i]; lcol = fe.col[i]; }
    }
    this.cam(d.x, DOOR_H + 0.3, d.z);
    if (this.qz > NEAR && dist < 18) this.text(label, this.W / 2 + (this.qx * this.f) / this.qz, this.H / 2 - (this.qy * this.f) / this.qz, (0.3 * this.f) / this.qz, lcol);
  }

  private prop(k: number, d: number, e: Eye, hot: boolean): void {
    const ctx = this.ctx, p: RoomProp = this.world.props[k], chat = p.kind === "terminal", h = chat ? 1.0 : 0.9, col = this.propCol[k];
    // pedestal: a square column; the farthest face is hidden, the other three drawn far to near
    const r = p.r * 0.85, cx = this.pcx, cz = this.pcz; cx[0] = p.x + r; cx[1] = p.x - r; cx[2] = p.x - r; cx[3] = p.x + r; cz[0] = p.z + r; cz[1] = p.z + r; cz[2] = p.z - r; cz[3] = p.z - r;
    for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; this.fd[i] = Math.hypot((cx[i] + cx[j]) / 2 - e.x, (cz[i] + cz[j]) / 2 - e.z); this.fi[i] = i; }
    for (let a = 1; a < 4; a++) { const ii = this.fi[a]; let b = a; while (b > 0 && this.fd[this.fi[b - 1]] < this.fd[ii]) { this.fi[b] = this.fi[b - 1]; b--; } this.fi[b] = ii; }
    ctx.lineWidth = hot ? 3 : 1.6; ctx.strokeStyle = hot ? "#fff" : col; ctx.fillStyle = hot ? this.C.propHotFill : "rgba(6,12,18,.88)";
    for (let q = 1; q < 4; q++) { const i = this.fi[q], j = (i + 1) & 3; if (this.quad(cx[i], 0, cz[i], cx[j], 0, cz[j], cx[j], h, cz[j], cx[i], h, cz[i])) { ctx.fill(); ctx.stroke(); } }
    if (this.quad(cx[0], h, cz[0], cx[1], h, cz[1], cx[2], h, cz[2], cx[3], h, cz[3])) { ctx.fill(); ctx.stroke(); }
    // the screen: leans back from the middle of the room
    const L = Math.hypot(p.x, p.z) || 1, ux = L > 1e-6 ? -p.x / L : 1, uz = L > 1e-6 ? -p.z / L : 0, tx = -uz, tz = ux, hw = chat ? 0.55 : 0.42, sh = chat ? 0.7 : 0.6, back = -0.28;
    const x0 = p.x + tx * hw, z0 = p.z + tz * hw, x1 = p.x - tx * hw, z1 = p.z - tz * hw;
    if (this.quad(x1, h, z1, x0, h, z0, x0 + ux * back, h + sh, z0 + uz * back, x1 + ux * back, h + sh, z1 + uz * back)) {
      ctx.fillStyle = hot ? this.C.hotFill : chat ? "rgba(255,170,60,.26)" : "rgba(120,220,255,.16)"; ctx.fill(); ctx.lineWidth = hot ? 3 : 1.6; ctx.strokeStyle = hot ? "#fff" : col; ctx.stroke();
      ctx.beginPath();
      for (let s = 1; s <= 3; s++) { const u = s * 0.25, bk = back * u, y = h + sh * u; this.seg(p.x - tx * hw * 0.85 + ux * bk, y, p.z - tz * hw * 0.85 + uz * bk, p.x + tx * hw * 0.85 + ux * bk, y, p.z + tz * hw * 0.85 + uz * bk); }
      ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,255,255,.35)" : this.C.scan; ctx.stroke();
    }
    const cl = chat && d < 6 ? this.world.chat : undefined; // the screen reads out the last things said in this room
    if (cl) for (let i = 0; i < cl.length && i < 3; i++) {
      const u = 0.78 - i * 0.24; this.cam(p.x + ux * back * u, h + sh * u, p.z + uz * back * u);
      if (this.qz > NEAR) { const sz = (0.105 * this.f) / this.qz; if (sz >= 7) this.text(cl[i], this.W / 2 + (this.qx * this.f) / this.qz, this.H / 2 - (this.qy * this.f) / this.qz, sz, hot ? "#fff" : "#ffd9a0"); }
    }
    this.cam(p.x, h + sh + 0.22, p.z);
    if (this.qz > NEAR && (d < 7 || hot)) this.text(this.propLabel[k], this.W / 2 + (this.qx * this.f) / this.qz, this.H / 2 - (this.qy * this.f) / this.qz, (0.26 * this.f) / this.qz, hot ? "#fff" : col);
  }

  /** Another member: a lit capsule with a visor on the side they face, and their name. */
  private person(o: Shown, e: Eye): void {
    const ctx = this.ctx, W = this.W, H = this.H, f = this.f, ghost = o.ghost !== undefined;
    this.cam(o.x, 0, o.z); if (this.qz < NEAR) return; const bx = this.qx, by = this.qy, bz = this.qz;
    if (ghost) ctx.globalAlpha = Math.max(0, Math.min(1, o.ghost!)) * 0.42; // an echo: the same figure, faint
    this.cam(o.x, 1.72, o.z); const ty = this.qy;
    let col = this.personCol.get(o.name); if (!col) { col = hueColor(hueOf(o.name), 62); this.personCol.set(o.name, col); }
    const k = f / bz, cx = W / 2 + bx * k, yb = H / 2 - by * k, yt = H / 2 - ty * k, hgt = yb - yt, w = hgt * 0.17;
    ctx.fillStyle = "rgba(6,12,18,.9)"; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, Math.min(2.5, hgt / 60));
    ctx.beginPath(); ctx.moveTo(cx - w, yb); ctx.lineTo(cx - w * 0.75, yt + hgt * 0.24); ctx.lineTo(cx + w * 0.75, yt + hgt * 0.24); ctx.lineTo(cx + w, yb); ctx.closePath(); ctx.fill(); ctx.stroke();
    const hr = hgt * 0.085, hy = yt + hgt * 0.1; ctx.beginPath(); ctx.arc(cx, hy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const fx = Math.cos(o.yaw), fz = Math.sin(o.yaw), rx = -this.sy, rz = this.cy, vx = this.cy, vz = this.sy, side = fx * rx + fz * rz, toward = -(fx * vx + fz * vz);
    if (toward > -0.2) { ctx.fillStyle = col; ctx.fillRect(cx + side * hr * 0.6 - hr * 0.55, hy - hr * 0.18, hr * 1.1, hr * 0.36); }
    if (bz < (ghost ? 9 : 14)) this.text(ghost ? (o.note ?? o.name) : o.name, cx, yt - 6, (0.26 * f) / bz, col);
    if (ghost) ctx.globalAlpha = 1;
    void e;
  }

  /** The ping: a ring spreading over the floor (and a second at chest height), and a marker on everything unscanned that it has reached. */
  private echo(e: EchoField, now: number): void {
    const ctx = this.ctx, r = e.radius(now), a = e.ring(now);
    if (r > 0.05 && a > 0.02) {
      ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = 2.5; ctx.strokeStyle = "#9fe9ff"; ctx.beginPath();
      const N = 56;
      for (let k = 0; k < N; k++) { const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2; this.seg(e.x + Math.cos(t0) * r, 0.03, e.z + Math.sin(t0) * r, e.x + Math.cos(t1) * r, 0.03, e.z + Math.sin(t1) * r); this.seg(e.x + Math.cos(t0) * r, 1.1, e.z + Math.sin(t0) * r, e.x + Math.cos(t1) * r, 1.1, e.z + Math.sin(t1) * r); }
      ctx.stroke(); ctx.restore();
    }
    for (let i = 0; i < e.n; i++) {
      if (e.seal[i] || e.scanned[i]) continue; const g = e.glow(i, now); if (g <= 0) continue;
      this.cam(e.tx[i], e.ty[i], e.tz[i]); if (this.qz < NEAR) continue;
      const x = this.W / 2 + (this.qx * this.f) / this.qz, y = this.H / 2 - (this.qy * this.f) / this.qz, s = Math.max(6, Math.min(18, (0.2 * this.f) / this.qz)) * (0.8 + 0.2 * Math.sin(now / 160));
      ctx.save(); ctx.globalAlpha = g; ctx.lineWidth = 2; ctx.strokeStyle = "#ffb347"; ctx.fillStyle = "rgba(255,179,71,.25)"; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      if (this.qz < 10 && g > 0.6) this.text("SCAN", x, y - s - 6, 11, "#ffb347");
    }
  }

  /** A ring filling round the thing being scanned. */
  private scanRing(s: { x: number; y: number; z: number; p: number }): void {
    this.cam(s.x, s.y, s.z); if (this.qz < NEAR) return;
    const ctx = this.ctx, x = this.W / 2 + (this.qx * this.f) / this.qz, y = this.H / 2 - (this.qy * this.f) / this.qz, r = Math.max(22, Math.min(80, (0.7 * this.f) / this.qz));
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,179,71,.28)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffb347"; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.p); ctx.stroke();
  }

  /** Corner brackets round what you are locked on to. */
  private bracket(l: Lock): void {
    this.cam(l.x, l.y, l.z); if (this.qz < NEAR) return;
    const ctx = this.ctx, x = this.W / 2 + (this.qx * this.f) / this.qz, y = this.H / 2 - (this.qy * this.f) / this.qz, s = Math.max(16, Math.min(70, (0.55 * this.f) / this.qz)), c = s * 0.38;
    ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) { ctx.moveTo(x + sx * s, y + sy * (s - c)); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * (s - c), y + sy * s); }
    ctx.stroke();
  }

  /** The drone: a lit hexagon with a ring round it (the ring turns and breathes while music plays), its track under it. Records where it is on screen so a tap can find it. */
  private drone(v: DroneView, e: Eye): void {
    this.cam(v.d.x, v.d.y, v.d.z); if (this.qz < NEAR) { v.hit = null; return; }
    const ctx = this.ctx, z = this.qz, sx = this.W / 2 + (this.qx * this.f) / z, sy = this.H / 2 - (this.qy * this.f) / z, r = Math.max(9, Math.min(46, (0.15 * this.f) / z)), col = v.playing ? this.color : "#d9a441";
    if (v.hit) { v.hit.x = sx; v.hit.y = sy; v.hit.r = r; } else v.hit = { x: sx, y: sy, r };
    const pulse = v.playing ? 1 + Math.sin(v.t * 6) * 0.08 : 1, spin = v.playing ? v.t * 2.2 : 0.6, g = glow(col, v.playing ? 0.45 : 0.18);
    ctx.save(); ctx.translate(sx, sy);
    if (g) ctx.drawImage(g, -r * 2.4, -r * 2.4, r * 4.8, r * 4.8);
    ctx.lineWidth = Math.max(1.2, r / 10); ctx.strokeStyle = col; ctx.fillStyle = "rgba(6,12,18,.92)";
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 1.25 * pulse, r * 0.36 * pulse, spin * 0.15, spin, spin + Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = v.playing ? "#fff" : col; ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (z < 5) this.text(v.title ? (v.playing ? v.title.slice(0, 26) : `paused · ${v.title.slice(0, 18)}`) : "tap me", sx, sy + r * 1.7 + 8, 11, col);
    void e;
  }

  /** Little plan of the room in the corner: doors, pedestals and which way you face. North is the map's "up", as on the Scan map. */
  private map(eye: Eye, link: Link | null): void {
    const ctx = this.ctx, W = this.W, H = this.H, world = this.world, S = Math.max(64, Math.min(96, Math.min(W, H) * 0.22)), cx = W - 10 - S / 2, cy = 10 + S / 2 + 26, k = (S / 2 - 3) / world.R;
    ctx.save(); ctx.fillStyle = "rgba(4,8,12,.7)"; ctx.fillRect(cx - S / 2, cy - S / 2, S, S);
    ctx.beginPath(); for (let i = 0; i < this.n; i++) { const x = cx + this.v[i][0] * k, y = cy + this.v[i][1] * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath();
    ctx.lineWidth = 1.5; ctx.strokeStyle = this.C.mapLine; ctx.stroke();
    if (link) { // the corridor, cut off at the edge of the little plan
      ctx.save(); ctx.beginPath(); ctx.rect(cx - S / 2, cy - S / 2, S, S); ctx.clip(); ctx.beginPath();
      for (let i = 0; i < link.c.n; i++) { const x = cx + link.c.pts[i * 2] * k, y = cy + link.c.pts[i * 2 + 1] * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.lineWidth = 3; ctx.strokeStyle = this.C.mapLine; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.restore();
    }
    ctx.lineWidth = 4;
    for (let i = 0; i < world.doors.length; i++) { const d = world.doors[i]; ctx.beginPath(); ctx.moveTo(cx + (d.x - d.tx * d.hw) * k, cy + (d.z - d.tz * d.hw) * k); ctx.lineTo(cx + (d.x + d.tx * d.hw) * k, cy + (d.z + d.tz * d.hw) * k); ctx.strokeStyle = d.state === "open" ? "#ffb347" : "#4c6577"; ctx.stroke(); }
    ctx.fillStyle = "#9fe9ff"; for (let i = 0; i < world.props.length; i++) ctx.fillRect(cx + world.props[i].x * k - 1.5, cy + world.props[i].z * k - 1.5, 3, 3);
    const ex = cx + eye.x * k, ez = cy + eye.z * k, fx = Math.cos(eye.yaw), fz = Math.sin(eye.yaw);
    ctx.beginPath(); ctx.moveTo(ex + fx * 5, ez + fz * 5); ctx.lineTo(ex - fx * 3 - fz * 3, ez - fz * 3 + fx * 3); ctx.lineTo(ex - fx * 3 + fz * 3, ez - fz * 3 - fx * 3); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();
  }
}

const painters = new WeakMap<RoomWorld, Map<string, RoomPainter>>();
/** Paint one frame. The painter for a room and colour is built once and kept. */
export function paintRoom(ctx: CanvasRenderingContext2D, W: number, H: number, world: RoomWorld, eye: Eye, color: string, target: Target | null, others: Shown[] = [], drone: DroneView | null = null, lock: Lock | null = null, sp: ScenePaint | null = null, fx: FxView | null = null): PaintStats {
  let m = painters.get(world); if (!m) { m = new Map(); painters.set(world, m); }
  let p = m.get(color); if (!p) { p = new RoomPainter(world, color); m.set(color, p); }
  return p.paint(ctx, W, H, eye, target, others, drone, lock, sp, fx);
}

/** The painter for a room (built once, kept). */
export function painterFor(world: RoomWorld, color: string): RoomPainter {
  let m = painters.get(world); if (!m) { m = new Map(); painters.set(world, m); }
  let p = m.get(color); if (!p) { p = new RoomPainter(world, color); m.set(color, p); }
  return p;
}
