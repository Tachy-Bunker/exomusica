export const VISOR_DEFAULT = "#5ef2d0";
export const VISOR_MINE_DEFAULT = "#f5a524";
/** Named choices, in the spirit of a visor's modes. Any #rrggbb is allowed too. */
export const VISOR_PRESETS: { name: string; main: string; mine: string }[] = [
  { name: "Scan cyan", main: "#5ef2d0", mine: "#f5a524" },
  { name: "Combat red", main: "#ff5a4d", mine: "#ffd36b" },
  { name: "Thermal amber", main: "#f5a524", mine: "#7be0ff" },
  { name: "Echo violet", main: "#b99cff", mine: "#9bf0c4" },
  { name: "Phazon green", main: "#7dff6a", mine: "#ff7ad9" },
  { name: "X-ray blue", main: "#6aa8ff", mine: "#ffb36a" },
];
export const isHex = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

/** How readable a colour is on the dark panel (WCAG contrast against #0b0f14): below 4.5 small text gets hard to read. */
export function contrastOnDark(hex: string): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const n = parseInt(hex.slice(1), 16);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const bg = 0.2126 * lin(11) + 0.7152 * lin(15) + 0.0722 * lin(20);
  return (L + 0.05) / (bg + 0.05);
}
