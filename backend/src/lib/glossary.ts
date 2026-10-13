/** Validation for glossary terms. A term is a word or short phrase; aliases are other spellings that link to the same entry. */
export interface GlossaryInput { term?: unknown; aliases?: unknown; definition?: unknown }

export function cleanGlossary(b: GlossaryInput, partial: boolean): { data: { term?: string; aliases?: string[]; definition?: string } } | { error: string } {
  const data: { term?: string; aliases?: string[]; definition?: string } = {};
  const word = (s: string) => s.trim().replace(/\s+/g, " ");
  if (b.term !== undefined || !partial) { if (typeof b.term !== "string" || !word(b.term) || word(b.term).length > 60) return { error: "A term (up to 60 characters) is required" }; data.term = word(b.term); }
  if (b.aliases !== undefined) {
    if (!Array.isArray(b.aliases) || b.aliases.length > 12 || !b.aliases.every((a) => typeof a === "string" && word(a).length >= 1 && word(a).length <= 60)) return { error: "Up to 12 aliases of up to 60 characters" };
    const seen = new Set<string>(data.term ? [data.term.toLowerCase()] : []);
    data.aliases = (b.aliases as string[]).map(word).filter((a) => (seen.has(a.toLowerCase()) ? false : (seen.add(a.toLowerCase()), true)));
  }
  if (b.definition !== undefined || !partial) { if (typeof b.definition !== "string" || !b.definition.trim() || b.definition.length > 4000) return { error: "A definition (up to 4000 characters) is required" }; data.definition = b.definition.trim(); }
  return { data };
}
