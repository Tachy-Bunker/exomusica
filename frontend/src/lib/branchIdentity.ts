import { nameHue } from "./spaceHubs";

// A branch's look: one accent colour and one emblem, chosen by an admin. Branches without a choice get a colour from their name,
// so they still look different from each other, and a default emblem.
export const GLYPHS = ["planet", "crystal", "wave", "orbit", "bars", "leaf", "star", "moon"] as const;
export type Glyph = (typeof GLYPHS)[number];
export const GLYPH_LABEL: Record<Glyph, string> = { planet: "Ringed planet", crystal: "Crystal", wave: "Wave", orbit: "Orbit", bars: "Equalizer bars", leaf: "Leaf", star: "Star", moon: "Crescent moon" };

/** Colours that read well on the dark theme. Any #rrggbb is allowed too. */
export const PALETTE: { name: string; hex: string }[] = [
  { name: "Pulsar blue", hex: "#4fa8e0" }, { name: "Aurora green", hex: "#6fd3a6" }, { name: "Ember orange", hex: "#e8814a" }, { name: "Nebula violet", hex: "#b99cff" },
  { name: "Rose quartz", hex: "#f08fb0" }, { name: "Solar gold", hex: "#e8c15a" }, { name: "Ice cyan", hex: "#6fe0e8" }, { name: "Moss", hex: "#9bc46a" },
  { name: "Coral red", hex: "#e8695f" }, { name: "Lavender grey", hex: "#a9b4d8" }, { name: "Deep teal", hex: "#3fb5a8" }, { name: "Peach", hex: "#f2b394" },
];

export const isHexColor = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
export const isGlyph = (s: unknown): s is Glyph => typeof s === "string" && (GLYPHS as readonly string[]).includes(s);

/** The colour used when an admin hasn't picked one. */
export const derivedColor = (slug: string) => `hsl(${nameHue(slug)} 55% 64%)`;

export interface IdentityInput { slug: string; color?: string | null; glyph?: string | null; seed?: boolean }
export function identityOf(b: IdentityInput): { color: string; glyph: Glyph; chosen: boolean } {
  const color = isHexColor(b.color) ? b.color : derivedColor(b.slug);
  const glyph = isGlyph(b.glyph) ? b.glyph : b.seed ? "leaf" : "planet";
  return { color, glyph, chosen: isHexColor(b.color) || isGlyph(b.glyph) };
}
