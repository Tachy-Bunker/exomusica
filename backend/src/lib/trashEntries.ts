// Trash entries for rooms, prefabs, themes and pictures (P35). Pure: the window itself is lib/trash.ts (30 days).
export type EntryKind = "doc" | "texture";

export interface DocMeta { version: number; history: { version: number; doc: string; savedAt: string }[] }
export interface TexMeta { id: number; name: string; sky: boolean; createdAt: string }

const obj = (s: string): Record<string, unknown> => { try { const o = JSON.parse(s); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };

/** The saved versions of a room as they were when it was deleted, so a restore brings the history back too. */
export function encodeDocMeta(m: DocMeta): string { return JSON.stringify(m); }
export function decodeDocMeta(s: string): DocMeta {
  const o = obj(s);
  const history = Array.isArray(o.history) ? o.history.flatMap((h): DocMeta["history"] => {
    const r = h as Record<string, unknown>;
    return h && typeof r.doc === "string" && Number.isInteger(r.version) && typeof r.savedAt === "string" ? [{ version: r.version as number, doc: r.doc, savedAt: r.savedAt }] : [];
  }) : [];
  return { version: Number.isInteger(o.version) ? (o.version as number) : 0, history };
}

export function encodeTexMeta(m: TexMeta): string { return JSON.stringify(m); }
/** Null when the entry has no usable id (then it cannot be restored with the id its rooms point at). */
export function decodeTexMeta(s: string): TexMeta | null {
  const o = obj(s);
  const id = o.id;
  if (!Number.isInteger(id) || (id as number) < 1) return null;
  return { id: id as number, name: typeof o.name === "string" ? o.name : "picture", sky: o.sky === true, createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString() };
}

/** What the admin sees for a room document: a prefab, a branch theme, a corridor, or a room. */
export function docLabel(slug: string): string {
  if (slug.startsWith("prefab~")) return `Prefab “${slug.slice(7)}”`;
  if (slug.startsWith("theme~")) return `Theme “${slug.slice(6)}”`;
  if (slug.includes("~")) return `Corridor ${slug.replace("~", " – ")}`;
  return `Room “${slug}”`;
}
export const docKindOf = (slug: string): "prefab" | "theme" | "corridor" | "room" => slug.startsWith("prefab~") ? "prefab" : slug.startsWith("theme~") ? "theme" : slug.includes("~") ? "corridor" : "room";
export const LIBRARY_MAX = 300;
