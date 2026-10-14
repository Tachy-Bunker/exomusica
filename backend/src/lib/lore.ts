/** Validation for lore entries. The key is the address a scan uses, so the room can find the text for what you scanned. */
export const LORE_KEY = /^[a-z]{2,12}:[\w .@~/#:+-]{1,100}$/i;
export interface LoreInput { key?: unknown; title?: unknown; body?: unknown }

export function cleanLore(b: LoreInput, partial: boolean): { data: { key?: string; title?: string; body?: string } } | { error: string } {
  const data: { key?: string; title?: string; body?: string } = {};
  if (b.key !== undefined || !partial) { if (typeof b.key !== "string" || !LORE_KEY.test(b.key.trim())) return { error: "A key like branch:slug, album:slug or room:slug/terminal is required" }; data.key = b.key.trim(); }
  if (b.title !== undefined || !partial) { const t = typeof b.title === "string" ? b.title.trim().replace(/\s+/g, " ") : ""; if (!t || t.length > 80) return { error: "A title (up to 80 characters) is required" }; data.title = t; }
  if (b.body !== undefined || !partial) { if (typeof b.body !== "string" || !b.body.trim() || b.body.length > 3000) return { error: "Text (up to 3000 characters) is required" }; data.body = b.body.trim(); }
  return { data };
}
