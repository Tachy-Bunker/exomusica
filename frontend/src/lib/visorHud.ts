// The visor: a sci-fi heads-up display drawn from data the room already has (no new data, no schema).
// Two visors. Combat: one map (the radar, top-left), integrity, lock-on. Scan: the reticle, outlines of what is
// in view (green once it is in the logbook, purple until then), the target and the scan's progress. One small
// overlay canvas, redrawn at most ~20 times a second and only when something moved; no allocation in draw().

/** A thing in view, outlined in scan mode: where it is on screen, its size, and whether it is already in the logbook. */
export interface ScanMark { sx: number; sy: number; sz: number; scanned: boolean }

export interface HudIn {
  x: number; z: number; yaw: number;
  verts: readonly (readonly [number, number])[];
  doors: readonly { x: number; z: number }[];
  /** things to scan: positions, and which are already in the logbook */
  scan: readonly { x: number; z: number }[]; scanned: ArrayLike<number>;
  others: Iterable<{ x: number; z: number }>;
  integ: number; done: number; total: number; name: string; color: string; t: number; locked: boolean; low: boolean; target: string; tdist: number; /** when the visor was switched on (seconds, same clock as t) */ on: number;
  /** combat: the radar (the one map). scan: the reticle and the outlines */
  mode: "combat" | "scan";
  /** scan visor: the thing under the reticle is already in the logbook */
  targetScanned: boolean;
  /** touch screen (no right button): the prompt names the Scan button */
  touch?: boolean;
  /** scan visor: the scan's progress, 0 when no scan runs */
  scanP: number;
  /** scan visor: what is in view, outlined */
  marks: readonly ScanMark[];
}

const CY = "#7fe9ff", CY2 = "rgba(127,233,255,.35)", AMB = "#ffb347";
/** scan visor outlines: green once a thing is in the logbook, purple until then */
export const SCAN_GREEN = "#7dff9e", SCAN_PURPLE = "#b48bff";
const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const HUD_KEY = "exomusica_hud";
export const hudOn = (): boolean => { try { return localStorage.getItem(HUD_KEY) !== "0"; } catch { return true; } };
export const setHudOn = (v: boolean): void => { try { localStorage.setItem(HUD_KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };

/** A chamfered (cut-corner) bracket: the visor's signature shape. */
function bracket(c: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, len: number, cut: number): void {
  c.beginPath(); c.moveTo(x + sx * len, y); c.lineTo(x + sx * cut, y); c.lineTo(x, y + sy * cut); c.lineTo(x, y + sy * len); c.stroke();
}
function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number): void { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke(); }
const FONT = "ui-monospace,Menlo,Consolas,monospace";
function two(n: number): string { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }

export function drawHud(c: CanvasRenderingContext2D, w: number, h: number, s: HudIn): void {
  c.clearRect(0, 0, w, h);
  const u = Math.max(0.7, Math.min(1.25, Math.min(w, h) / 560)); // one unit scales with the screen
  const m = 14 * u;
  c.lineWidth = 1.5 * u; c.lineJoin = "miter"; c.lineCap = "butt";

  // scan-in: the brackets unfold and the frame fades up over ~0.6 s after the visor comes on (instant for reduced motion)
  const sk = REDUCED ? 1 : Math.min(1, Math.max(0, (s.t - s.on) / 0.6)), ke = 1 - (1 - sk) * (1 - sk);
  // frame: four brackets and a faint inner edge so the view reads as seen through a visor
  c.strokeStyle = CY; c.globalAlpha = 0.75 * ke; c.shadowColor = CY; c.shadowBlur = s.low ? 0 : 6;
  const L = 46 * u * (0.3 + 0.7 * ke), K = 14 * u;
  bracket(c, m, m, 1, 1, L, K); bracket(c, w - m, m, -1, 1, L, K); bracket(c, m, h - m, 1, -1, L, K); bracket(c, w - m, h - m, -1, -1, L, K);
  c.shadowBlur = 0; c.globalAlpha = 0.18; c.strokeRect(m + 2, m + 2, w - 2 * m - 4, h - 2 * m - 4);

  if (s.mode === "scan") scanVisor(c, w, h, s, u, m); else combatVisor(c, w, h, s, u, m);

  // integrity, top centre (both visors)
  c.globalAlpha = 1;
  const pct = Math.round(s.integ * 100), bw = Math.min(220 * u, w * 0.3), bx = w / 2 - bw / 2, by = m + 32 * u;
  c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = s.integ < 0.3 ? "#ff8a5c" : "#e8fbff";
  c.font = `700 ${22 * u}px ${FONT}`; c.fillText(String(pct), w / 2, m + 24 * u);
  c.font = `${9 * u}px ${FONT}`; c.fillStyle = CY; c.fillText("INTEGRITY", w / 2 - 62 * u, m + 24 * u);
  const seg = 20, sw = bw / seg, on = Math.round(s.integ * seg);
  for (let i = 0; i < seg; i++) { c.fillStyle = i < on ? (s.integ < 0.3 ? "#ff8a5c" : CY) : "rgba(127,233,255,.16)"; c.fillRect(bx + i * sw + 1, by, sw - 2, 5 * u); }

  // visor icon, bottom-right (clear of the on-screen buttons on touch: the stage reserves the strip below)
  const vx = w - m - 30 * u, vy = h - m - 78 * u;
  c.strokeStyle = s.locked ? AMB : CY; c.globalAlpha = 0.9; ring(c, vx, vy, 13 * u); c.beginPath(); c.moveTo(vx - 20 * u, vy); c.lineTo(vx - 9 * u, vy); c.moveTo(vx + 9 * u, vy); c.lineTo(vx + 20 * u, vy); c.stroke();
  c.fillStyle = s.locked ? AMB : CY; c.beginPath(); c.arc(vx, vy, 3 * u, 0, 6.2832); c.fill(); c.globalAlpha = 1;
  if (s.locked && s.target) { // lock-on readout: name and range, in a cut-corner tag
    const txt = s.target.slice(0, 26).toUpperCase(), rng = s.tdist.toFixed(1) + " M"; c.font = `${10 * u}px ${FONT}`;
    const tw = Math.max(c.measureText(txt).width, c.measureText(rng).width) + 16 * u, tx = w - m - 12 * u - tw, ty = vy - 52 * u, th = 30 * u;
    c.fillStyle = "rgba(24,12,4,.6)"; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + tw - 8 * u, ty); c.lineTo(tx + tw, ty + 8 * u); c.lineTo(tx + tw, ty + th); c.lineTo(tx + 8 * u, ty + th); c.lineTo(tx, ty + th - 8 * u); c.closePath(); c.fill();
    c.strokeStyle = AMB; c.stroke(); c.fillStyle = AMB; c.textAlign = "right"; c.fillText(txt, tx + tw - 8 * u, ty + 12 * u); c.fillStyle = "#e8fbff"; c.fillText(rng, tx + tw - 8 * u, ty + 24 * u);
  }
}

/** Combat visor: the radar is the one map (the room's walls, doors, things and people around you, turning with you), and its name and scan count sit under it. */
function combatVisor(c: CanvasRenderingContext2D, w: number, h: number, s: HudIn, u: number, m: number): void {
  const R = 46 * u, rx = m + 12 * u + R, ry = m + 12 * u + R, range = 11, fx = Math.cos(s.yaw), fz = Math.sin(s.yaw);
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
  // name and scan count, under the map
  c.textAlign = "left"; c.fillStyle = AMB; c.font = `${9 * u}px ${FONT}`; c.fillText(s.name.slice(0, 18).toUpperCase(), rx - R, ry + R + 16 * u);
  c.fillStyle = s.done >= s.total && s.total ? "#9dffb0" : "#e8fbff"; c.font = `700 ${16 * u}px ${FONT}`;
  c.fillText(`${two(s.done)}/${two(s.total)}`, rx - R, ry + R + 36 * u);
  c.font = `${9 * u}px ${FONT}`; c.fillStyle = CY; c.fillText("SCANNED", rx - R + 70 * u, ry + R + 36 * u);
}

/** Scan visor: outlines of what is in view, the reticle at the centre (closing in while a scan runs), the target's name and the scan's progress. */
function scanVisor(c: CanvasRenderingContext2D, w: number, h: number, s: HudIn, u: number, m: number): void {
  c.globalAlpha = 1; c.lineWidth = 2 * u;
  for (const k of s.marks) {
    const r = k.sz, L = Math.max(5 * u, r * 0.5), K = Math.max(2 * u, r * 0.22);
    c.strokeStyle = k.scanned ? SCAN_GREEN : SCAN_PURPLE; c.globalAlpha = 0.95;
    bracket(c, k.sx - r, k.sy - r, 1, 1, L, K); bracket(c, k.sx + r, k.sy - r, -1, 1, L, K); bracket(c, k.sx - r, k.sy + r, 1, -1, L, K); bracket(c, k.sx + r, k.sy + r, -1, -1, L, K);
  }
  c.globalAlpha = 1; c.lineWidth = 1.5 * u;
  const cx = w / 2, cy = h / 2, R0 = 46 * u * (1 - 0.45 * s.scanP), tc = s.target ? (s.targetScanned ? SCAN_GREEN : SCAN_PURPLE) : CY;
  c.strokeStyle = tc; c.globalAlpha = 0.9;
  bracket(c, cx - R0, cy - R0, 1, 1, 14 * u, 5 * u); bracket(c, cx + R0, cy - R0, -1, 1, 14 * u, 5 * u); bracket(c, cx - R0, cy + R0, 1, -1, 14 * u, 5 * u); bracket(c, cx + R0, cy + R0, -1, -1, 14 * u, 5 * u);
  c.fillStyle = tc; c.beginPath(); c.arc(cx, cy, 2 * u, 0, 6.2832); c.fill(); c.globalAlpha = 1;
  // the target, and what the scan is doing
  c.textAlign = "center"; c.font = `${10 * u}px ${FONT}`;
  if (s.scanP > 0) {
    c.fillStyle = CY; c.fillText(`SCANNING ${Math.round(s.scanP * 100)}%`, cx, cy + R0 + 26 * u);
    c.strokeStyle = CY2; c.lineWidth = 1 * u; c.strokeRect(cx - 80 * u, cy + R0 + 34 * u, 160 * u, 4 * u);
    c.fillStyle = CY; c.fillRect(cx - 80 * u, cy + R0 + 34 * u, 160 * u * s.scanP, 4 * u);
  } else if (s.target) {
    c.fillStyle = tc; c.fillText(s.target.slice(0, 26).toUpperCase(), cx, cy + R0 + 22 * u);
    const act = s.touch ? "PRESS SCAN" : "RIGHT CLICK TO SCAN", read = s.touch ? "PRESS SCAN TO READ" : "RIGHT CLICK TO READ";
    c.fillStyle = CY; c.fillText(s.targetScanned ? `IN LOGBOOK · ${read}` : act, cx, cy + R0 + 36 * u);
  }
  // mode label and scan count, top-left
  c.textAlign = "left"; c.fillStyle = CY; c.font = `700 ${12 * u}px ${FONT}`; c.fillText("SCAN VISOR", m + 12 * u, m + 24 * u);
  c.fillStyle = s.done >= s.total && s.total ? "#9dffb0" : "#e8fbff"; c.font = `700 ${16 * u}px ${FONT}`; c.fillText(`${two(s.done)}/${two(s.total)}`, m + 12 * u, m + 46 * u);
  c.font = `${9 * u}px ${FONT}`; c.fillStyle = CY; c.fillText("SCANNED", m + 82 * u, m + 46 * u);
}
