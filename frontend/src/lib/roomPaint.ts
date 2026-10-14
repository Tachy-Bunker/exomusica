// Draws the room from the eye: 2D canvas, painter's order, no 3D library. Everything is lines and flat fills.
// Built to make no garbage while painting: all the geometry, colour strings and labels of a room are prepared once (RoomPainter), and a frame only fills typed scratch buffers.
import { DOOR_H, type RoomProp, type RoomWorld } from "./roomWorld";
import type { Shown } from "./roomNet";
import type { Drone } from "./roomDrone";
import type { Lock } from "./roomLock";
import { EYE_Y, NEAR, focalOf, type Eye, type Target } from "./roomView";

export const rgba = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return `rgba(120,220,255,${a})`;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export const hueColor = (h: number, l = 60): string => `hsl(${h},85%,${l}%)`;

// the nine spikes of a door, in door units: u across (-hw..hw), y up (0..DOOR_H), flat [u0,y0,u1,y1,...]. Same spiral as the door transition.
const BL = 9, TWIST = 1.15, W0 = 0.52, STEPS = 7;
export function spikePolys(hw: number, open: boolean): Float64Array[] {
  const cx = 0, cy = DOOR_H / 2, RX = hw * 1.75, RY = cy * 1.55, stop = open ? 0.6 : 0.04;
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
const FONTS: string[] = []; for (let s = 8; s <= 24; s++) FONTS[s] = `${s}px ui-monospace,Menlo,Consolas,monospace`;
const hueOf = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };
const clampI = (n: number, a: number, b: number): number => (n < a ? a : n > b ? b : Math.round(n));

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

  paint(ctx: CanvasRenderingContext2D, W: number, H: number, eye: Eye, target: Target | null, others: Shown[], drone: DroneView | null, lock: Lock | null): PaintStats {
    this.ctx = ctx; this.W = W; this.H = H; this.f = focalOf(W, H); this.stats.polys = 0;
    this.ex = eye.x; this.ez = eye.z; this.sy = Math.sin(eye.yaw); this.cy = Math.cos(eye.yaw); this.sp = Math.sin(eye.pitch); this.cp = Math.cos(eye.pitch);
    const { n, v, world, C } = this, Hh = this.H3;
    ctx.fillStyle = "#04080c"; ctx.fillRect(0, 0, W, H);
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
      const i = this.order[oi], a = v[i], b = v[(i + 1) % n], near = this.dist[i] < 256;
      if (this.quad(a[0], 0, a[1], b[0], 0, b[1], b[0], Hh, b[1], a[0], Hh, a[1])) { ctx.fillStyle = i % 2 ? C.wallB : C.wallA; ctx.fill(); }
      ctx.beginPath();
      this.seg(a[0], 0.35, a[1], b[0], 0.35, b[1]); this.seg(a[0], Hh - 0.4, a[1], b[0], Hh - 0.4, b[1]);
      if (near) { const cols = Math.max(2, Math.round(this.wallLen[i] / 1.8)); for (let c = 1; c < cols; c++) { const t = c / cols, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; this.seg(x, 0.35, z, x, Hh - 0.4, z); } }
      ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.beginPath(); this.seg(a[0], 0, a[1], a[0], Hh, a[1]); ctx.lineWidth = 2; ctx.strokeStyle = C.edge; ctx.stroke();
      for (let di = 0; di < world.doors.length; di++) if (world.doors[di].edge === i) this.door(di, eye, target?.kind === "door" && target.door.id === world.doors[di].id);
    }

    // things in the room, far to near: terminals (pedestal with a leaning screen) and the other people
    const np = world.props.length, no = Math.min(others.length, 64 - np);
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
    if (lock) this.bracket(lock);
    if (drone) this.drone(drone, eye);
    this.map(eye);
    ctx.strokeStyle = C.cross; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 7, H / 2); ctx.lineTo(W / 2 + 7, H / 2); ctx.moveTo(W / 2, H / 2 - 7); ctx.lineTo(W / 2, H / 2 + 7); ctx.stroke();
    return this.stats;
  }

  private door(di: number, e: Eye, hot: boolean): void {
    const ctx = this.ctx, d = this.world.doors[di], C = this.C, open = d.state === "open", ox = -d.nx * 0.03, oz = -d.nz * 0.03, hw = d.hw;
    const ax = d.x - d.tx * hw + ox, az = d.z - d.tz * hw + oz, bx = d.x + d.tx * hw + ox, bz = d.z + d.tz * hw + oz;
    const dist = Math.hypot(d.x - e.x, d.z - e.z);
    if (!this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az)) return;
    ctx.fillStyle = open ? (hot ? C.doorOpenHot : C.doorOpen) : "rgba(8,14,20,.9)"; ctx.fill();
    // spikes only when all four corners are in front and the door is near
    let allFront = dist < 16;
    if (allFront) for (let k = 0; k < 4 && allFront; k++) { this.cam(k & 1 ? bx : ax, k > 1 ? DOOR_H : 0, k & 1 ? bz : az); if (this.qz < NEAR) allFront = false; }
    if (allFront) {
      ctx.save(); this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az); ctx.clip();
      const set = open ? SPIKES.open : SPIKES.closed, hwid = this.W / 2, hh = this.H / 2, f = this.f;
      ctx.fillStyle = open ? C.spike : "rgba(70,95,115,.55)"; ctx.strokeStyle = open ? C.spikeStroke : "rgba(111,135,152,.6)"; ctx.lineWidth = 1;
      for (let s = 0; s < set.length; s++) {
        const pts = set[s]; ctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) { this.cam(d.x + d.tx * pts[k] + ox, pts[k + 1], d.z + d.tz * pts[k] + oz); const x = hwid + (this.qx * f) / this.qz, y = hh - (this.qy * f) / this.qz; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); this.stats.polys++;
      }
      ctx.restore();
    }
    this.quad(ax, 0, az, bx, 0, bz, bx, DOOR_H, bz, ax, DOOR_H, az); ctx.lineWidth = hot ? 3.5 : 2; ctx.strokeStyle = open ? (hot ? C.doorEdgeHot : C.doorEdge) : hot ? "rgba(111,135,152,1)" : "rgba(111,135,152,.85)"; ctx.stroke();
    this.cam(d.x, DOOR_H + 0.3, d.z);
    if (this.qz > NEAR && dist < 18) this.text(this.doorLabel[di], this.W / 2 + (this.qx * this.f) / this.qz, this.H / 2 - (this.qy * this.f) / this.qz, (0.3 * this.f) / this.qz, open ? this.C.doorEdgeHot : "#8aa0b0");
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
    this.cam(p.x, h + sh + 0.22, p.z);
    if (this.qz > NEAR && (d < 7 || hot)) this.text(this.propLabel[k], this.W / 2 + (this.qx * this.f) / this.qz, this.H / 2 - (this.qy * this.f) / this.qz, (0.26 * this.f) / this.qz, hot ? "#fff" : col);
  }

  /** Another member: a lit capsule with a visor on the side they face, and their name. */
  private person(o: Shown, e: Eye): void {
    const ctx = this.ctx, W = this.W, H = this.H, f = this.f;
    this.cam(o.x, 0, o.z); if (this.qz < NEAR) return; const bx = this.qx, by = this.qy, bz = this.qz;
    this.cam(o.x, 1.72, o.z); const ty = this.qy;
    let col = this.personCol.get(o.name); if (!col) { col = hueColor(hueOf(o.name), 62); this.personCol.set(o.name, col); }
    const k = f / bz, cx = W / 2 + bx * k, yb = H / 2 - by * k, yt = H / 2 - ty * k, hgt = yb - yt, w = hgt * 0.17;
    ctx.fillStyle = "rgba(6,12,18,.9)"; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, Math.min(2.5, hgt / 60));
    ctx.beginPath(); ctx.moveTo(cx - w, yb); ctx.lineTo(cx - w * 0.75, yt + hgt * 0.24); ctx.lineTo(cx + w * 0.75, yt + hgt * 0.24); ctx.lineTo(cx + w, yb); ctx.closePath(); ctx.fill(); ctx.stroke();
    const hr = hgt * 0.085, hy = yt + hgt * 0.1; ctx.beginPath(); ctx.arc(cx, hy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const fx = Math.cos(o.yaw), fz = Math.sin(o.yaw), rx = -this.sy, rz = this.cy, vx = this.cy, vz = this.sy, side = fx * rx + fz * rz, toward = -(fx * vx + fz * vz);
    if (toward > -0.2) { ctx.fillStyle = col; ctx.fillRect(cx + side * hr * 0.6 - hr * 0.55, hy - hr * 0.18, hr * 1.1, hr * 0.36); }
    if (bz < 14) this.text(o.name, cx, yt - 6, (0.26 * f) / bz, col);
    void e;
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
  private map(eye: Eye): void {
    const ctx = this.ctx, W = this.W, H = this.H, world = this.world, S = Math.max(64, Math.min(96, Math.min(W, H) * 0.22)), cx = W - 10 - S / 2, cy = 10 + S / 2 + 26, k = (S / 2 - 3) / world.R;
    ctx.save(); ctx.fillStyle = "rgba(4,8,12,.7)"; ctx.fillRect(cx - S / 2, cy - S / 2, S, S);
    ctx.beginPath(); for (let i = 0; i < this.n; i++) { const x = cx + this.v[i][0] * k, y = cy + this.v[i][1] * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath();
    ctx.lineWidth = 1.5; ctx.strokeStyle = this.C.mapLine; ctx.stroke();
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
export function paintRoom(ctx: CanvasRenderingContext2D, W: number, H: number, world: RoomWorld, eye: Eye, color: string, target: Target | null, others: Shown[] = [], drone: DroneView | null = null, lock: Lock | null = null): PaintStats {
  let m = painters.get(world); if (!m) { m = new Map(); painters.set(world, m); }
  let p = m.get(color); if (!p) { p = new RoomPainter(world, color); m.set(color, p); }
  return p.paint(ctx, W, H, eye, target, others, drone, lock);
}
