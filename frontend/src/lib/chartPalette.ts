// Chart colours that follow a picture: the study's background image gives one colour, the series are spread around it.
// Every colour is kept above a luminance floor so a dark picture never produces lines you can't read on the dark panel.

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [(h + 360) % 360, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The least luminance a chart colour may have: about 4.6:1 against the near-black panel. */
export const LUMINANCE_FLOOR = 0.2;

/** Lifts a colour (keeping its hue) until it clears the luminance floor. */
export function withFloor(h: number, s: number, l: number, floor = LUMINANCE_FLOOR): [number, number, number] {
  let L = clamp01(l);
  let rgb = hslToRgb(h, s, L);
  for (let i = 0; i < 40 && luminance(rgb) < floor && L < 0.95; i++) { L += 0.02; rgb = hslToRgb(h, s, L); }
  return rgb;
}

const OFFSETS = [0, 38, -38, 150, 190, 275];

/** `n` series colours around the picture's colour. A near-grey picture still gets a lively hue (saturation floor). */
export function chartPalette(base: string | null, n: number): string[] {
  const rgb = base ? hexToRgb(base) : null;
  if (!rgb) return [];
  const [h, s0, l0] = rgbToHsl(rgb);
  const s = Math.max(0.5, Math.min(0.9, s0 < 0.12 ? 0.5 : s0 + 0.15));
  const l = Math.max(0.6, Math.min(0.72, l0 + 0.25));
  return Array.from({ length: n }, (_, i) => toHex(withFloor((h + OFFSETS[i % OFFSETS.length] + 360) % 360, s, l - (i >= OFFSETS.length ? 0.06 : 0))));
}

/** The panel accent: the picture's colour above the same floor. */
export function chartAccent(base: string | null): string | null {
  return chartPalette(base, 1)[0] ?? null;
}
