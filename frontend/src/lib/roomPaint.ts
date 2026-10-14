// Draws the room from the eye: 2D canvas, painter's order, no 3D library. Everything is lines and flat fills, so it stays light on weak devices.
import { DOOR_H, type RoomDoor, type RoomProp, type RoomWorld } from "./roomWorld";
import { EYE_Y, NEAR, clipNear, focalOf, toCam, type Eye, type P3, type Target } from "./roomView";

export const rgba = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return `rgba(120,220,255,${a})`;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export const hueColor = (h: number, l = 60): string => `hsl(${h},85%,${l}%)`;

// the nine spikes of a door, in door units: u across (-hw..hw), y up (0..DOOR_H). Same spiral as the door transition.
const BL = 9, TWIST = 1.15, W0 = 0.52;
export function spikePolys(hw: number, open: boolean): [number, number][][] {
  const cx = 0, cy = DOOR_H / 2, RX = hw * 1.75, RY = cy * 1.55, steps = 7, stop = open ? 0.6 : 0.04;
  return Array.from({ length: BL }, (_, i) => {
    const a = (i * Math.PI * 2) / BL - Math.PI / 2, left: [number, number][] = [], right: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const f = 1 - (k / steps) * (1 - stop), w = W0 * Math.pow(f, 0.65), spin = a + TWIST * (1 - f);
      left.push([cx + RX * f * Math.cos(spin - w), cy + RY * f * Math.sin(spin - w)]);
      right.unshift([cx + RX * f * Math.cos(spin + w), cy + RY * f * Math.sin(spin + w)]);
    }
    return [...left, ...right];
  });
}
const SPIKES = { closed: spikePolys(0.85, false), open: spikePolys(0.85, true) };

const camP = (e: Eye, x: number, y: number, z: number): P3 => toCam(e, [x, y, z]);
const scr = (p: P3, W: number, H: number, f: number): [number, number] => [W / 2 + (p[0] * f) / p[2], H / 2 - (p[1] * f) / p[2]];

/** Add a line from a to b (world points) to the path, cut at the near plane. */
function seg(path: Path2D, e: Eye, a: P3, b: P3, W: number, H: number, f: number): void {
  const A = toCam(e, a), B = toCam(e, b);
  if (A[2] < NEAR && B[2] < NEAR) return;
  let a2 = A, b2 = B;
  if (A[2] < NEAR) { const t = (NEAR - A[2]) / (B[2] - A[2]); a2 = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]; }
  else if (B[2] < NEAR) { const t = (NEAR - B[2]) / (A[2] - B[2]); b2 = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, NEAR]; }
  const p = scr(a2, W, H, f), q = scr(b2, W, H, f); path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]);
}
/** A world polygon on the screen (cut at the near plane); false when none of it is in front. */
function poly(ctx: CanvasRenderingContext2D, e: Eye, pts: P3[], W: number, H: number, f: number): boolean {
  const c = clipNear(pts.map((p) => toCam(e, p))); if (c.length < 3) return false;
  ctx.beginPath(); c.forEach((p, i) => { const s = scr(p, W, H, f); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); return true;
}
const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string) => {
  ctx.font = `${size}px ui-monospace,Menlo,Consolas,monospace`; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y);
};

function paintDoor(ctx: CanvasRenderingContext2D, e: Eye, d: RoomDoor, color: string, hot: boolean, W: number, H: number, f: number): void {
  const open = d.state === "open", inset = 0.03, ox = -d.nx * inset, oz = -d.nz * inset;
  const L = (u: number, y: number): P3 => [d.x + d.tx * u + ox, y, d.z + d.tz * u + oz];
  const quad = [L(-d.hw, 0), L(d.hw, 0), L(d.hw, DOOR_H), L(-d.hw, DOOR_H)];
  const cams = quad.map((p) => toCam(e, p)), allFront = cams.every((c) => c[2] >= NEAR);
  const dist = Math.hypot(d.x - e.x, d.z - e.z), col = open ? color : "#6f8798";
  if (!poly(ctx, e, quad, W, H, f)) return;
  ctx.fillStyle = open ? rgba(color, hot ? 0.34 : 0.2) : "rgba(8,14,20,.9)"; ctx.fill();
  if (allFront && dist < 16) {
    ctx.save(); poly(ctx, e, quad, W, H, f); ctx.clip();
    const set = open ? SPIKES.open : SPIKES.closed;
    ctx.fillStyle = open ? rgba(color, 0.32) : "rgba(70,95,115,.55)"; ctx.strokeStyle = rgba(col, open ? 0.9 : 0.6); ctx.lineWidth = 1;
    for (const sp of set) {
      ctx.beginPath();
      sp.forEach(([u, y], i) => { const s = scr(toCam(e, L(u, y)), W, H, f); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  poly(ctx, e, quad, W, H, f); ctx.lineWidth = hot ? 3.5 : 2; ctx.strokeStyle = rgba(col, hot ? 1 : 0.85); ctx.stroke();
  // name above the door
  const top = camP(e, d.x, DOOR_H + 0.3, d.z);
  if (top[2] > NEAR && dist < 18) {
    const s = scr(top, W, H, f), size = Math.max(10, Math.min(17, (0.3 * f) / top[2]));
    text(ctx, open ? d.name ?? "" : "sealed", s[0], s[1], size, open ? col : "#8aa0b0");
  }
}

function prism(ctx: CanvasRenderingContext2D, e: Eye, p: RoomProp, h: number, fill: string, stroke: string, W: number, H: number, f: number, lw: number): void {
  const r = p.r * 0.85, c: [number, number][] = [[p.x + r, p.z + r], [p.x - r, p.z + r], [p.x - r, p.z - r], [p.x + r, p.z - r]];
  const faces = c.map((a, i) => { const b = c[(i + 1) % 4]; return { a, b, d: Math.hypot((a[0] + b[0]) / 2 - e.x, (a[1] + b[1]) / 2 - e.z) }; }).sort((x, y) => y.d - x.d);
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  for (const q of faces.slice(1)) if (poly(ctx, e, [[q.a[0], 0, q.a[1]], [q.b[0], 0, q.b[1]], [q.b[0], h, q.b[1]], [q.a[0], h, q.a[1]]], W, H, f)) { ctx.fill(); ctx.stroke(); }
  if (poly(ctx, e, c.map((a) => [a[0], h, a[1]] as P3), W, H, f)) { ctx.fill(); ctx.stroke(); }
}

export function paintRoom(ctx: CanvasRenderingContext2D, W: number, H: number, world: RoomWorld, eye: Eye, color: string, target: Target | null): void {
  const f = focalOf(W, H), n = world.sides, v = world.verts;
  ctx.fillStyle = "#04080c"; ctx.fillRect(0, 0, W, H);
  const P = (i: number, y: number, k = 1): P3 => [v[i % n][0] * k, y, v[i % n][1] * k];
  // ceiling and floor
  if (poly(ctx, eye, v.map((_, i) => P(i, world.H)), W, H, f)) { ctx.fillStyle = rgba(color, 0.05); ctx.fill(); }
  if (poly(ctx, eye, v.map((_, i) => P(i, 0)), W, H, f)) { ctx.fillStyle = rgba(color, 0.09); ctx.fill(); }
  const grid = new Path2D();
  for (const k of [0.34, 0.67]) for (let i = 0; i < n; i++) seg(grid, eye, P(i, 0, k), P(i + 1, 0, k), W, H, f);
  for (let i = 0; i < n; i++) seg(grid, eye, P(i, 0, 0.12), P(i, 0), W, H, f);
  for (let i = 0; i < n; i++) seg(grid, eye, P(i, world.H, 0.6), P(i + 1, world.H, 0.6), W, H, f);
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(color, 0.22); ctx.stroke(grid);

  // walls, far to near
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => dist2(world, eye, b) - dist2(world, eye, a));
  const wallLines = new Path2D(), edges = new Path2D();
  for (const i of order) {
    const a = v[i], b = v[(i + 1) % n];
    if (poly(ctx, eye, [P(i, 0), P(i + 1, 0), P(i + 1, world.H), P(i, world.H)], W, H, f)) { ctx.fillStyle = rgba(color, i % 2 ? 0.1 : 0.13); ctx.fill(); }
    seg(edges, eye, P(i, 0), P(i, world.H), W, H, f);
    seg(wallLines, eye, P(i, 0.35), P(i + 1, 0.35), W, H, f); seg(wallLines, eye, P(i, world.H - 0.4), P(i + 1, world.H - 0.4), W, H, f);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), cols = Math.max(2, Math.round(len / 1.8));
    for (let c = 1; c < cols; c++) { const t = c / cols, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; seg(wallLines, eye, [x, 0.35, z], [x, world.H - 0.4, z], W, H, f); }
    for (const d of world.doors) if (d.edge === i) paintDoor(ctx, eye, d, color, target?.kind === "door" && target.door.id === d.id, W, H, f);
  }
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(color, 0.2); ctx.stroke(wallLines);
  ctx.lineWidth = 2; ctx.strokeStyle = rgba(color, 0.8); ctx.stroke(edges);

  // things in the room, far to near
  const props = [...world.props].sort((a, b) => Math.hypot(b.x - eye.x, b.z - eye.z) - Math.hypot(a.x - eye.x, a.z - eye.z));
  for (const p of props) {
    const hot = target?.kind === "prop" && target.prop.id === p.id, h = p.kind === "terminal" ? 1.25 : 0.9;
    const col = p.kind === "terminal" ? hueColor(p.hue, 58) : p.kind === "more" ? color : hueColor(p.hue, 62);
    prism(ctx, eye, p, h, hot ? rgba(color, 0.28) : "rgba(6,12,18,.88)", hot ? "#fff" : col, W, H, f, hot ? 3 : 1.6);
    const c = camP(eye, p.x, h + (p.kind === "terminal" ? 0.28 : 0.55), p.z);
    if (c[2] > NEAR) {
      const s = scr(c, W, H, f), z = c[2], sz = Math.min(44, (p.kind === "terminal" ? 0.3 : 0.24) * f / z);
      ctx.beginPath();
      if (p.kind === "terminal") ctx.rect(s[0] - sz * 0.9, s[1] - sz * 0.55, sz * 1.8, sz * 1.1);
      else { ctx.moveTo(s[0], s[1] - sz); ctx.lineTo(s[0] + sz * 0.7, s[1]); ctx.lineTo(s[0], s[1] + sz); ctx.lineTo(s[0] - sz * 0.7, s[1]); ctx.closePath(); }
      ctx.fillStyle = rgba(color, 0.0); ctx.fillStyle = p.kind === "terminal" ? "rgba(255,170,60,.28)" : "rgba(255,255,255,.07)"; ctx.fill(); ctx.lineWidth = hot ? 3 : 1.6; ctx.strokeStyle = hot ? "#fff" : col; ctx.stroke();
      const dist = Math.hypot(p.x - eye.x, p.z - eye.z);
      if (dist < 7 || hot) text(ctx, p.kind === "terminal" ? "TALK" : p.label.length > 22 ? p.label.slice(0, 21) + "…" : p.label, s[0], s[1] - sz * 1.3 - 4, Math.max(10, Math.min(16, (0.26 * f) / z)), hot ? "#fff" : col);
    }
  }
  paintMap(ctx, W, H, world, eye, color);
  // a small cross to aim with
  ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 7, H / 2); ctx.lineTo(W / 2 + 7, H / 2); ctx.moveTo(W / 2, H / 2 - 7); ctx.lineTo(W / 2, H / 2 + 7); ctx.stroke();
}
const dist2 = (w: RoomWorld, e: Eye, i: number): number => { const a = w.verts[i], b = w.verts[(i + 1) % w.sides]; return ((a[0] + b[0]) / 2 - e.x) ** 2 + ((a[1] + b[1]) / 2 - e.z) ** 2; };

/** Little plan of the room in the corner: doors, pedestals and which way you face. North is the map's "up", as on the Scan map. */
function paintMap(ctx: CanvasRenderingContext2D, W: number, H: number, world: RoomWorld, eye: Eye, color: string): void {
  const S = Math.max(64, Math.min(96, Math.min(W, H) * 0.22)), cx = W - 10 - S / 2, cy = 10 + S / 2 + 26, k = (S / 2 - 3) / world.R;
  ctx.save(); ctx.fillStyle = "rgba(4,8,12,.7)"; ctx.fillRect(cx - S / 2, cy - S / 2, S, S);
  ctx.beginPath(); world.verts.forEach(([x, z], i) => { if (i) ctx.lineTo(cx + x * k, cy + z * k); else ctx.moveTo(cx + x * k, cy + z * k); }); ctx.closePath();
  ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(color, 0.8); ctx.stroke();
  for (const d of world.doors) { ctx.beginPath(); ctx.moveTo(cx + (d.x - d.tx * d.hw) * k, cy + (d.z - d.tz * d.hw) * k); ctx.lineTo(cx + (d.x + d.tx * d.hw) * k, cy + (d.z + d.tz * d.hw) * k); ctx.lineWidth = 4; ctx.strokeStyle = d.state === "open" ? "#ffb347" : "#4c6577"; ctx.stroke(); }
  ctx.fillStyle = "#9fe9ff"; for (const p of world.props) ctx.fillRect(cx + p.x * k - 1.5, cy + p.z * k - 1.5, 3, 3);
  const ex = cx + eye.x * k, ez = cy + eye.z * k, fx = Math.cos(eye.yaw), fz = Math.sin(eye.yaw);
  ctx.beginPath(); ctx.moveTo(ex + fx * 5, ez + fz * 5); ctx.lineTo(ex - fx * 3 - fz * 3, ez - fz * 3 + fx * 3); ctx.lineTo(ex - fx * 3 + fz * 3, ez - fz * 3 - fx * 3); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
}
export { EYE_Y };
