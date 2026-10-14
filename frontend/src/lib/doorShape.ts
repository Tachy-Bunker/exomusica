/** Geometry of the stronghold door: nine curved spikes that wind into the middle and cling together, inside an octagonal frame. Landscape units: the picture is 160 x 100 around (0,0); portrait turns the whole thing a quarter turn. */
export const BLADES = 9;
export const HALF_W = 80, HALF_H = 50, CHAMFER = 17;
const RX = 125, RY = 78;       // rim ellipse, past the corners so the blades cover the whole frame
const TWIST = 1.15;            // how far the spiral winds between rim and middle (radians, clockwise)
const W0 = 0.52;               // half width of a spike at the rim (radians): wide enough that neighbours overlap

const at = (f: number, ang: number): [number, number] => [RX * f * Math.cos(ang), RY * f * Math.sin(ang)];
const fmt = (p: [number, number]): string => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

export interface Blade { d: string; rib: string; ox: number; oy: number; rot: number }

export function blade(i: number, n = BLADES): Blade {
  const a = (i * Math.PI * 2) / n - Math.PI / 2;
  const steps = 14, left: string[] = [], right: string[] = [];
  for (let k = 0; k <= steps; k++) {
    const f = 1 - k / steps * 0.97;                         // 1 -> 0.03
    const w = W0 * Math.pow(f, 0.65);
    const spin = a + TWIST * (1 - f);
    left.push(fmt(at(f, spin - w)));
    right.unshift(fmt(at(f, spin + w)));
  }
  const rib: string[] = [];
  for (let k = 0; k <= 9; k++) { const f = 1 - k / 9 * 0.88; rib.push(fmt(at(f, a + TWIST * (1 - f)))); }
  // leaves along a wide ellipse, swinging on round the way the spiral winds
  const dir = a + TWIST * 0.5;
  return { d: `M${left.join(" L")} L${right.join(" L")} Z`, rib: `M${rib.join(" L")}`, ox: Math.round(Math.cos(dir) * 210), oy: Math.round(Math.sin(dir) * 135), rot: 34 };
}

export const frameOctagon = (): string => {
  const w = HALF_W, h = HALF_H, c = CHAMFER;
  return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]].map((p) => p.join(",")).join(" ");
};
/** The corners of the screen outside the octagon, as one even-odd path. */
export const cornerMask = (): string => `M-100,-70 H100 V70 H-100 Z M${frameOctagon().split(" ").join(" L")} Z`;

export const isPortrait = (w: number, h: number): boolean => h > w;
