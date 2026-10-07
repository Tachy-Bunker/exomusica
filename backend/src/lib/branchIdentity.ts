// A branch's visual identity is chosen by an admin: one accent colour and one emblem. Both are optional; branches without a choice get a
// colour derived from their name on the site. Validated here because the colour ends up in styles and the glyph picks an image.

export const BRANCH_GLYPHS = ["planet", "crystal", "wave", "orbit", "bars", "leaf", "star", "moon"] as const;
export type BranchGlyph = (typeof BRANCH_GLYPHS)[number];

export const isHexColor = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
export const isGlyph = (s: unknown): s is BranchGlyph => typeof s === "string" && (BRANCH_GLYPHS as readonly string[]).includes(s);

/** null = fine; otherwise what is wrong. `null` values are allowed (they clear the choice). */
export function identityProblem(body: { identityColor?: unknown; identityGlyph?: unknown }): string | null {
  if (body.identityColor !== undefined && body.identityColor !== null && !isHexColor(body.identityColor)) return "identityColor must be a colour like #4fa8e0";
  if (body.identityGlyph !== undefined && body.identityGlyph !== null && !isGlyph(body.identityGlyph)) return `identityGlyph must be one of: ${BRANCH_GLYPHS.join(", ")}`;
  return null;
}

/** Stored as typed but lower-cased, so "#4FA8E0" and "#4fa8e0" are one colour. */
export const normalizeColor = (c: string | null | undefined) => (c ? c.toLowerCase() : c);
