// The visor: a sci-fi heads-up display drawn from data the room already has (no new data, no schema).
// Radar (rotates with you), room map, integrity, scan counter, angular frame. One small overlay canvas,
// redrawn at most ~20 times a second and only when something moved; no allocation in draw().

export interface HudIn {
  x: number; z: number; yaw: number;
  verts: readonly (readonly [number, number])[];
  doors: readonly { x: number; z: number }[];
  /** things to scan: positions, and which are already in the logbook */
  scan: readonly { x: number; z: number }[]; scanned: ArrayLike<number>;
  others: Iterable<{ x: number; z: number }>;
  integ: number; done: number; total: number; name: string; color: string; t: number; locked: boolean; low: boolean; target: string; tdist: number;
}

const CY = "#7fe9ff", CY2 = "rgba(127,233,255,.35)", AMB = "#ffb347";
const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const HUD_KEY = "exomusica_hud";
export const hudOn = (): boolean => { try { return localStorage.getItem(HUD_KEY) !== "0"; } catch { return true; } };
export const setHudOn = (v: boolean): void => { try { localStorage.setItem(HUD_KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };

/** A chamfered (cut-corner) bracket: the visor's signature shape. */
function bracket(c: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, len: number, cut: number): void {
  c.beginPath(); c.moveTo(x, y + sy * len); c.lineTo(x, y + sy * cut); c.lineTo(x + sx * cut, y); c.lineTo(x + sx * len, y); c.stroke();
}

function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number): void { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke(); }

export function drawHud(c: CanvasRenderingContext2D, w: number, h: number, s: HudIn): void {
  c.clearRect(0, 0, w, h);
  const u = Math.max(0.7, Math.min(1.25, Math.min(w, h) / 560)); // one unit scales with the screen
  const m = 14 * u, fx = Math.cos(s.yaw), fz = Math.sin(s.yaw);
  c.lineWidth = 1.5 * u; c.lineJoin = "miter"; c.lineCap = "butt";

  // frame: four brackets and a faint inner edge so the view reads as seen through a visor
  c.strokeStyle = CY; c.globalAlpha = 0.75; c.shadowColor = CY; c.shadowBlur = s.low ? 0 : 6;
  const L = 46 * u, K = 14 * u;
  bracket(c, m, m, 1, 1, L, K); bracket(c, w - m, m, -1, 1, L, K); bracket(c, m, h - m, 1, -1, L, K); bracket(c, w - m, h - m, -1, -1, L, K);
  c.shadowBlur = 0; c.globalAlpha = 0.18; c.strokeRect(m + 2, m + 2, w - 2 * m - 4, h - 2 * m - 4);

  // radar, top-left
  const R = 46 * u, rx = m + 12 * u + R, ry = m + 12 * u + R, range = 11;
  c.globalAlpha = 1; c.fillStyle = "rgba(4,16,22,.55)"; c.beginPath(); c.arc(rx, ry, R, 0, 6.2832); c.fill();
  c.strokeStyle = CY2; ring(c, rx, ry, R); ring(c, rx, ry, R * 0.5);
  c.beginPath(); c.moveTo(rx - R, ry); c.lineTo(rx + R, ry); c.moveTo(rx, ry - R); c.lineTo(rx, ry + R); c.stroke();
  // sweep: a slow smooth turn (0.25 Hz), a soft wedge behind a bright line
  const a = REDUCED ? 0.8 : (s.t * 1.5708) % 6.2832; // the sweep stands still for reduced motion
  c.save(); c.beginPath(); c.arc(rx, ry, R, 0, 6.2832); c.clip();
  c.fillStyle = "rgba(127,233,255,.10)"; c.beginPath(); c.moveTo(rx, ry); c.arc(rx, ry, R, a - 0.7, a); c.closePath(); c.fill();
  c.strokeStyle = "rgba(127,233,255,.7)"; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a) * R, ry + Math.sin(a) * R); c.stroke();
  const k = R / range;
  // walls
  c.strokeStyle = "rgba(127,233,255,.8)"; c.beginPath();
  const V = s.verts;
  for (let i = 0; i <= V.length; i++) { const v = V[i % V.length], dx = v[0] - s.x, dz = v[1] - s.z; const px = rx + (-dx * fz + dz * fx) * k, py = ry - (dx * fx + dz * fz) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  c.stroke();
  // doors, scannables, people
  c.fillStyle = "#9dffb0"; for (const d of s.doors) { const dx = d.x - s.x, dz = d.z - s.z; c.fillRect(rx + (-dx * fz + dz * fx) * k - 2 * u, ry - (dx * fx + dz * fz) * k - 2 * u, 4 * u, 4 * u); }
  for (let i = 0; i < s.scan.length; i++) {
    const p = s.scan[i], dx = p.x - s.x, dz = p.z - s.z, px = rx + (-dx * fz + dz * fx) * k, py = ry - (dx * fx + dz * fz) * k;
    c.fillStyle = s.scanned[i] ? "rgba(127,233,255,.45)" : AMB; c.beginPath(); c.moveTo(px, py - 3.5 * u); c.lineTo(px + 3 * u, py); c.lineTo(px, py + 3.5 * u); c.lineTo(px - 3 * u, py); c.closePath(); c.fill();
  }
  c.fillStyle = "#ff7a9c"; for (const o of s.others) { const dx = o.x - s.x, dz = o.z - s.z; c.beginPath(); c.arc(rx + (-dx * fz + dz * fx) * k, ry - (dx * fx + dz * fz) * k, 2.4 * u, 0, 6.2832); c.fill(); }
  c.restore();
  // you: an arrow pointing up
  c.fillStyle = "#fff"; c.beginPath(); c.moveTo(rx, ry - 5 * u); c.lineTo(rx + 3.5 * u, ry + 4 * u); c.lineTo(rx - 3.5 * u, ry + 4 * u); c.closePath(); c.fill();
  c.strokeStyle = CY; c.globalAlpha = 0.9; ring(c, rx, ry, R + 3 * u); c.globalAlpha = 1;

  // integrity, top centre: big number and a segmented bar
  const pct = Math.round(s.integ * 100), bw = Math.min(220 * u, w * 0.3), bx = w / 2 - bw / 2, by = m + 32 * u;
  c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = s.integ < 0.3 ? "#ff8a5c" : "#e8fbff";
  c.font = `700 ${22 * u}px ui-monospace,Menlo,Consolas,monospace`; c.fillText(String(pct), w / 2, m + 24 * u);
  c.font = `${9 * u}px ui-monospace,Menlo,Consolas,monospace`; c.fillStyle = CY; c.fillText("INTEGRITY", w / 2 - 62 * u, m + 24 * u);
  const seg = 20, sw = bw / seg, on = Math.round(s.integ * seg);
  for (let i = 0; i < seg; i++) { c.fillStyle = i < on ? (s.integ < 0.3 ? "#ff8a5c" : CY) : "rgba(127,233,255,.16)"; c.fillRect(bx + i * sw + 1, by, sw - 2, 5 * u); }

  // room map, top-right: the hull outline, fitted; you as a dot with a heading tick
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const v of V) { if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0]; if (v[1] < z0) z0 = v[1]; if (v[1] > z1) z1 = v[1]; }
  const MW = 96 * u, mx = w - m - 12 * u - MW, my = m + 12 * u, span = Math.max(x1 - x0, z1 - z0, 1), ms = (MW - 10 * u) / span;
  const ox = mx + MW / 2 - ((x0 + x1) / 2) * ms, oy = my + MW / 2 - ((z0 + z1) / 2) * ms;
  c.fillStyle = "rgba(24,12,4,.5)"; c.fillRect(mx, my, MW, MW); c.strokeStyle = "rgba(255,179,71,.5)"; c.strokeRect(mx, my, MW, MW);
  c.strokeStyle = AMB; c.globalAlpha = 0.9; c.beginPath(); for (let i = 0; i <= V.length; i++) { const v = V[i % V.length]; if (i) c.lineTo(ox + v[0] * ms, oy + v[1] * ms); else c.moveTo(ox + v[0] * ms, oy + v[1] * ms); } c.stroke(); c.globalAlpha = 1;
  c.fillStyle = "#9dffb0"; for (const d of s.doors) c.fillRect(ox + d.x * ms - 2, oy + d.z * ms - 2, 4, 4);
  const px = ox + s.x * ms, py = oy + s.z * ms; c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, 2.6 * u, 0, 6.2832); c.fill();
  c.strokeStyle = "#fff"; c.beginPath(); c.moveTo(px, py); c.lineTo(px + fx * 8 * u, py + fz * 8 * u); c.stroke();
  c.textAlign = "right"; c.fillStyle = AMB; c.font = `${9 * u}px ui-monospace,Menlo,Consolas,monospace`; c.fillText(s.name.slice(0, 18).toUpperCase(), mx + MW, my + MW + 12 * u);

  // scan counter, right
  c.textAlign = "right"; c.fillStyle = s.done >= s.total && s.total ? "#9dffb0" : "#e8fbff"; c.font = `700 ${16 * u}px ui-monospace,Menlo,Consolas,monospace`;
  const two = (n: number): string => (n < 10 ? "00" : n < 100 ? "0" : "") + n;
  c.fillText(`${two(s.done)}/${two(s.total)}`, w - m - 12 * u, my + MW + 38 * u);
  c.font = `${9 * u}px ui-monospace,Menlo,Consolas,monospace`; c.fillStyle = CY; c.fillText("SCANNED", w - m - 12 * u, my + MW + 50 * u);

  // visor icon, bottom-right (clear of the on-screen buttons on touch: the stage reserves the strip below)
  const vx = w - m - 30 * u, vy = h - m - 78 * u;
  c.strokeStyle = s.locked ? AMB : CY; c.globalAlpha = 0.9; ring(c, vx, vy, 13 * u); c.beginPath(); c.moveTo(vx - 20 * u, vy); c.lineTo(vx - 9 * u, vy); c.moveTo(vx + 9 * u, vy); c.lineTo(vx + 20 * u, vy); c.stroke();
  c.fillStyle = s.locked ? AMB : CY; c.beginPath(); c.arc(vx, vy, 3 * u, 0, 6.2832); c.fill(); c.globalAlpha = 1;
  if (s.locked && s.target) { // lock-on readout: name and range, in a cut-corner tag
    const txt = s.target.slice(0, 26).toUpperCase(), rng = s.tdist.toFixed(1) + " M"; c.font = `${10 * u}px ui-monospace,Menlo,Consolas,monospace`;
    const tw = Math.max(c.measureText(txt).width, c.measureText(rng).width) + 16 * u, tx = w - m - 12 * u - tw, ty = vy - 52 * u, th = 30 * u;
    c.fillStyle = "rgba(24,12,4,.6)"; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + tw - 8 * u, ty); c.lineTo(tx + tw, ty + 8 * u); c.lineTo(tx + tw, ty + th); c.lineTo(tx + 8 * u, ty + th); c.lineTo(tx, ty + th - 8 * u); c.closePath(); c.fill();
    c.strokeStyle = AMB; c.stroke(); c.fillStyle = AMB; c.textAlign = "right"; c.fillText(txt, tx + tw - 8 * u, ty + 12 * u); c.fillStyle = "#e8fbff"; c.fillText(rng, tx + tw - 8 * u, ty + 24 * u);
  }
}
