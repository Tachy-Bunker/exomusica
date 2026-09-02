// Ported from the Entoptic Cemetery prototype's warden generation and
// drawing code. Deliberately keeps the prototype's random makeWardens()
// for now — step 2 of the migration plan replaces this with deterministic
// per-branch seeding, but step 1's job is matching the prototype's visual
// behavior first.

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spike {
  len: number;
  curve: number;
  rate: number;
  phase: number;
}

export interface Warden {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  size: number;
  hue: number;
  eyeHue: number;
  spikes: Spike[];
  spin: number;
  facing: number;
  phase: number;
  pulseRate: number;
  pupilRate: number;
  coreJag: number;
  trail: { x: number; y: number }[];
  lastTrailAt: number;
}

const WARDEN_HUE_BASE = 272;

export function makeWardens(count: number, seed: number): Warden[] {
  const list: Warden[] = [];
  for (let i = 0; i < count; i++) {
    const r = mulberry32((seed ^ 0x51eedbee ^ (i * 0x2545f491)) >>> 0);
    const hue = WARDEN_HUE_BASE + (r() * 14 - 7);
    const spikeCount = 7 + Math.floor(r() * 7);
    const spikes: Spike[] = [];
    for (let s = 0; s < spikeCount; s++) {
      spikes.push({ len: 0.55 + r() * 0.95, curve: (r() - 0.5) * 0.5, rate: 0.0009 + r() * 0.0012, phase: r() * Math.PI * 2 });
    }
    const w: Warden = {
      x: r() * 1.5 - 0.75,
      y: r() * 1.5 - 0.75,
      tx: 0,
      ty: 0,
      speed: 0.00018 + r() * 0.00026,
      size: 24 + r() * 20,
      hue,
      eyeHue: hue,
      spikes,
      spin: (r() - 0.5) * 0.00045,
      facing: r() * Math.PI * 2,
      phase: r() * Math.PI * 2,
      pulseRate: 0.0011 + r() * 0.0009,
      pupilRate: 0.0006 + r() * 0.0007,
      coreJag: 0.1 + r() * 0.1,
      trail: [],
      lastTrailAt: 0,
    };
    pickWaypoint(w);
    list.push(w);
  }
  return list;
}

function pickWaypoint(o: Warden) {
  o.tx = Math.random() * 1.7 - 0.85;
  o.ty = Math.random() * 1.7 - 0.85;
}

function wardenSilhouette(ctx: CanvasRenderingContext2D, o: Warden, time: number, coreR: number) {
  const n = o.spikes.length;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const s0 = o.spikes[i % n];
    const a = (i / n) * Math.PI * 2;
    const pulse = 1 + Math.sin(time * s0.rate + s0.phase) * 0.08;
    const r = coreR * (1 + s0.len * pulse);
    const bow = s0.curve * coreR;
    const xx = Math.cos(a) * r - Math.sin(a) * bow;
    const yy = Math.sin(a) * r + Math.cos(a) * bow;
    if (i === 0) ctx.moveTo(xx, yy);
    else {
      const pa = ((i - 0.5) / n) * Math.PI * 2;
      const midR = coreR * 0.72;
      ctx.quadraticCurveTo(Math.cos(pa) * midR, Math.sin(pa) * midR, xx, yy);
    }
  }
  ctx.closePath();
}

function fract(x: number) {
  return x - Math.floor(x);
}

export interface WardenRenderState {
  time: number;
  pointerNormX: number;
  pointerNormY: number;
  hueShift: number;
  revealAmt: number;
  huskB: number;
  orbB: number;
  glowHue: number;
  glowSat: number;
  glowB: number;
}

const GLOW_LAYERS = [
  { w: 0.16, a: 0.3 },
  { w: 0.085, a: 0.5 },
  { w: 0.032, a: 0.85 },
];

export class WardenSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wardens: Warden[] = [];
  private haloGradient: CanvasGradient | null = null;
  private seed: number;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })!;
    this.seed = seed;
  }

  setWardens(count: number) {
    this.wardens = makeWardens(count, this.seed);
  }

  resize(cssWidth: number, cssHeight: number) {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    const layerScale = Math.min(Math.min(window.devicePixelRatio || 1, 1.4), 0.75);
    this.canvas.width = Math.max(1, (cssWidth * layerScale) | 0);
    this.canvas.height = Math.max(1, (cssHeight * layerScale) | 0);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  private getHaloGradient(): CanvasGradient {
    if (!this.haloGradient) {
      const g = this.ctx.createRadialGradient(0, 0, 0.22, 0, 0, 1.7);
      g.addColorStop(0, "hsla(272,55%,26%,0.22)");
      g.addColorStop(0.6, "hsla(276,50%,16%,0.10)");
      g.addColorStop(1, "hsla(280,50%,8%,0)");
      this.haloGradient = g;
    }
    return this.haloGradient;
  }

  // Same "unpredictable stripes with inertia" the field shader gets, cheaply
  // reimplemented on the CPU side so wardens visibly ride the same distortion.
  private bandHash(band: number, salt: number): number {
    const v = Math.sin(band * 12.9898 + salt * 78.233 + this.seed * 0.00005) * 43758.5453;
    return fract(v);
  }

  private rawBandDrift(band: number, nowSec: number): [number, number] {
    const h1 = this.bandHash(band, 18.31);
    const h2 = this.bandHash(band, 44.19);
    const h3 = this.bandHash(band, 76.53);
    const drift =
      Math.sin(nowSec * (0.028 + h1 * 0.09) + band * 4.13 + h3 * 6.2831) * 0.09 +
      Math.sin(nowSec * (0.009 + h2 * 0.03) + band * 1.71 + h1 * 6.2831) * 0.05;
    return [drift * this.cssHeight, drift * this.cssHeight * 0.12 * (h2 - 0.5)];
  }

  private stripeOffsetFor(y: number, nowSec: number): [number, number] {
    const bandF = y / 40;
    const b0 = Math.floor(bandF);
    const b1 = b0 + 1;
    let f = bandF - b0;
    f = f * f * (3 - 2 * f);
    const d0 = this.rawBandDrift(b0, nowSec);
    const d1 = this.rawBandDrift(b1, nowSec);
    return [d0[0] + (d1[0] - d0[0]) * f, d0[1] + (d1[1] - d0[1]) * f];
  }

  private trailScreenPoint(p: { x: number; y: number }): [number, number] {
    return [(p.x * 0.5 + 0.5) * this.cssWidth, (1 - (p.y * 0.5 + 0.5)) * this.cssHeight];
  }

  private drawTrail(o: Warden, size: number, dx: number, dy: number) {
    const gw = this.ctx;
    const pts = o.trail;
    const n = pts.length;
    if (n < 2) return;
    gw.globalCompositeOperation = "lighter";
    gw.lineCap = "round";
    gw.lineJoin = "round";
    for (let i = 1; i < n; i++) {
      const fade = i / n;
      const alpha = 0.26 * fade * fade;
      if (alpha < 0.004) continue;
      const p0 = this.trailScreenPoint(pts[i - 1]);
      const p1 = this.trailScreenPoint(pts[i]);
      const x0 = p0[0] + dx,
        y0 = p0[1] + dy,
        x1 = p1[0] + dx,
        y1 = p1[1] + dy;
      let mx = x1,
        my = y1;
      if (i < n - 1) {
        const p2 = this.trailScreenPoint(pts[i + 1]);
        mx = (x1 + p2[0] + dx) / 2;
        my = (y1 + p2[1] + dy) / 2;
      }
      gw.strokeStyle = `hsla(272,58%,48%,${alpha})`;
      gw.lineWidth = 0.5 + fade * 1.8 * (size / 26);
      gw.beginPath();
      gw.moveTo(x0, y0);
      gw.quadraticCurveTo(x1, y1, mx, my);
      gw.stroke();
    }
  }

  private drawGlow(o: Warden, time: number, reveal: number, glowHue: number, glowSat: number, glowB: number) {
    const amt = 0.06 + glowB * 0.7 + reveal * 0.3;
    if (amt < 0.01) return;
    const gw = this.ctx;
    gw.globalCompositeOperation = "lighter";
    for (const L of GLOW_LAYERS) {
      gw.strokeStyle = `hsla(${glowHue},${glowSat}%,62%,${Math.min(1, amt * L.a)})`;
      gw.lineWidth = L.w;
      wardenSilhouette(gw, o, time, 0.5);
      gw.stroke();
    }
  }

  private drawBody(
    o: Warden,
    time: number,
    hue: number,
    eyeHue: number,
    s: number,
    reveal: number,
    huskB: number,
    orbB: number,
    glowHue: number,
    glowSat: number,
    glowB: number,
    x: number,
    y: number,
  ) {
    const gw = this.ctx;
    gw.save();
    gw.translate(x, y);
    gw.scale(s, s);
    gw.rotate(o.facing);

    gw.globalCompositeOperation = "lighter";
    gw.globalAlpha = 0.3 + huskB * 0.55 + reveal * 1.1;
    gw.fillStyle = this.getHaloGradient();
    gw.beginPath();
    gw.arc(0, 0, 1.7, 0, Math.PI * 2);
    gw.fill();
    gw.globalAlpha = 1;

    this.drawGlow(o, time, reveal, glowHue, glowSat, glowB);

    const idleL = 4 + huskB * 38;
    gw.globalCompositeOperation = "source-over";
    gw.globalAlpha = Math.min(1, 0.5 + huskB * 0.4 + reveal * 0.18);
    wardenSilhouette(gw, o, time, 0.5);
    gw.fillStyle = `hsla(${hue},20%,${idleL + reveal * 30}%,0.92)`;
    gw.fill();
    gw.strokeStyle = `hsla(${hue},28%,${idleL + 12 + reveal * 32}%,${Math.min(1, 0.16 + huskB * 0.4 + reveal * 0.35)})`;
    gw.lineWidth = 1 / s;
    gw.stroke();

    gw.strokeStyle = `hsla(${hue},40%,${idleL + 18 + reveal * 26}%,${Math.min(1, 0.06 + huskB * 0.34 + reveal * 0.4)})`;
    gw.lineWidth = 0.8 / s;
    gw.beginPath();
    gw.moveTo(-0.28, -0.14);
    gw.lineTo(-0.05, 0.06);
    gw.lineTo(-0.16, 0.24);
    gw.stroke();

    const idleO = 4 + orbB * 38;
    const pupil = 0.5 + Math.sin(time * o.pupilRate + o.phase) * 0.4;
    gw.globalCompositeOperation = "lighter";
    gw.fillStyle = `hsla(${eyeHue},40%,${idleO + 10 + reveal * 18}%,${Math.min(1, 0.1 + orbB * 0.3 + reveal * 0.3)})`;
    gw.beginPath();
    gw.arc(0, 0, 0.3, 0, Math.PI * 2);
    gw.fill();
    gw.fillStyle = `hsla(${eyeHue},50%,${idleO + 8 + pupil * 8 + reveal * 36}%,${Math.min(0.95, 0.3 + orbB * 0.35 + reveal * 0.4)})`;
    gw.beginPath();
    gw.arc(0, 0, 0.17, 0, Math.PI * 2);
    gw.fill();
    gw.fillStyle = `hsla(${eyeHue},20%,4%,0.95)`;
    gw.beginPath();
    gw.ellipse(0, 0, 0.045 + 0.02 * pupil, 0.12, 0, 0, Math.PI * 2);
    gw.fill();

    gw.restore();
  }

  private drawOne(o: Warden, state: WardenRenderState) {
    const x0 = (o.x * 0.5 + 0.5) * this.cssWidth;
    const y0 = (1 - (o.y * 0.5 + 0.5)) * this.cssHeight;
    const s = o.size;
    const hue = (o.hue + state.hueShift + 360) % 360;
    const eyeHue = (o.eyeHue + state.hueShift + 360) % 360;
    const nowSec = state.time * 0.001;

    const dCursor = Math.hypot(o.x - state.pointerNormX, o.y - state.pointerNormY);
    const reveal = Math.pow(Math.max(0, 1 - dCursor / 0.26), 1.5) * state.revealAmt;

    const [trailDx, trailDy] = this.stripeOffsetFor(y0, nowSec);
    this.drawTrail(o, s, trailDx, trailDy);

    // Portal-style slicing: drawn in horizontal strips, each nudged by its
    // own band offset, so the body looks glimpsed through parallel portals
    // rather than hopping as one rigid block.
    const reach = s * 1.75;
    const STRIPS = 3;
    const stripH = (reach * 2) / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      const stripTop = y0 - reach + i * stripH;
      const stripCenterY = stripTop + stripH / 2;
      const [dx, dy] = this.stripeOffsetFor(stripCenterY, nowSec);
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x0 - reach * 1.3, stripTop - 0.5, reach * 2.6, stripH + 1);
      this.ctx.clip();
      this.drawBody(o, state.time, hue, eyeHue, s, reveal, state.huskB, state.orbB, state.glowHue, state.glowSat, state.glowB, x0 + dx, y0 + dy);
      this.ctx.restore();
    }
  }

  /** Advances waypoint wandering — call once per logic tick. */
  tick(dt: number, zoneSpeedFactor: number, driftMul: number) {
    for (const o of this.wardens) {
      const dx = o.tx - o.x;
      const dy = o.ty - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.03) pickWaypoint(o);
      else {
        const step = o.speed * dt * zoneSpeedFactor * (driftMul * 1.6);
        o.x += (dx / dist) * step;
        o.y += (dy / dist) * step;
      }
      o.facing += o.spin * dt * zoneSpeedFactor;
    }
  }

  updateTrails(now: number, trailAmt: number) {
    const trailCap = Math.round(trailAmt * 22);
    for (const o of this.wardens) {
      if (now - o.lastTrailAt > 90 && trailCap > 0) {
        o.lastTrailAt = now;
        o.trail.push({ x: o.x, y: o.y });
        while (o.trail.length > trailCap) o.trail.shift();
      } else if (trailCap === 0 && o.trail.length) {
        o.trail.length = 0;
      }
    }
  }

  render(state: WardenRenderState) {
    const gw = this.ctx;
    gw.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = this.canvas.width / this.cssWidth;
    gw.save();
    gw.scale(scale, scale);
    for (const o of this.wardens) this.drawOne(o, state);
    gw.restore();
  }

  /** Sources fed into the field shader's `sources[]`/`uFlyerLens[]` uniforms
   *  — wardens act as light sources and lens-distortion points in the field
   *  itself, matching the prototype's per-frame uniform wiring. */
  getFieldSources(now: number): { x: number; y: number; amp: number; phase: number }[] {
    return this.wardens.slice(0, 20).map((o) => ({ x: o.x * 0.5, y: o.y * 0.5, amp: 0.16, phase: now * 0.0022 + o.phase }));
  }

  getFieldFlyers(): { x: number; y: number; amp: number }[] {
    return this.wardens.slice(0, 6).map((o) => ({ x: o.x * 0.5, y: o.y * 0.5, amp: 0.5 }));
  }

  dispose() {
    this.wardens = [];
    this.haloGradient = null;
  }
}
