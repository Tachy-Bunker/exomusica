/** Brightness floor for colours drawn on the dark header: dark branch colours are lifted toward white until they reach `minLum` (relative luminance), keeping their hue. */
const parse = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lin = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
export const luminance = (hex: string): number => { const c = parse(hex); return c ? 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) : 1; };
const toHex = (c: number[]): string => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function lift(hex: string, minLum = 0.25): string {
  const c = parse(hex);
  if (!c || luminance(hex) >= minLum) return hex;
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    const l = luminance(toHex(c.map((v) => v + (255 - v) * t)));
    if (l >= minLum) hi = t; else lo = t;
  }
  return toHex(c.map((v) => v + (255 - v) * hi));
}
