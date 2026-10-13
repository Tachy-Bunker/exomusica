/** Validation for phenomenon cards. A stored chain must be well-formed because it ends up in a link other people open. */
const NAME = /^[A-Za-z0-9]{1,32}$/;

export function validChain(text: unknown): text is string {
  if (typeof text !== "string" || !text || text.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(text)) return false;
  try {
    const data: unknown = JSON.parse(Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return Array.isArray(data) && data.length >= 1 && data.length <= 8 && data.every((it) => Array.isArray(it) && it.length === 2 && typeof it[0] === "string" && NAME.test(it[0]) && Array.isArray(it[1]) && it[1].length <= 16 && it[1].every((v: unknown) => typeof v === "number" && v >= 0 && v <= 1));
  } catch { return false; }
}

export function phenomenonSlug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "phenomenon";
}

export interface PhenomenonInput { title?: unknown; summary?: unknown; body?: unknown; chain?: unknown; exampleTrackId?: unknown; published?: unknown }
/** Returns the fields to store, or an error message. Only the fields present are returned. */
export function cleanPhenomenon(b: PhenomenonInput, partial: boolean): { data: { title?: string; summary?: string; body?: string; chain?: string | null; exampleTrackId?: number | null; published?: boolean } } | { error: string } {
  const data: { title?: string; summary?: string; body?: string; chain?: string | null; exampleTrackId?: number | null; published?: boolean } = {};
  if (b.title !== undefined || !partial) { if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 120) return { error: "A title (up to 120 characters) is required" }; data.title = b.title.trim(); }
  if (b.summary !== undefined) { if (typeof b.summary !== "string" || b.summary.length > 300) return { error: "The summary can be up to 300 characters" }; data.summary = b.summary.trim(); }
  if (b.body !== undefined) { if (typeof b.body !== "string" || b.body.length > 20000) return { error: "The notes are too long" }; data.body = b.body; }
  if (b.chain !== undefined) { if (b.chain === null || b.chain === "") data.chain = null; else if (validChain(b.chain)) data.chain = b.chain; else return { error: "That isn't a valid chain link" }; }
  if (b.exampleTrackId !== undefined) { if (b.exampleTrackId === null) data.exampleTrackId = null; else if (Number.isInteger(b.exampleTrackId) && (b.exampleTrackId as number) > 0) data.exampleTrackId = b.exampleTrackId as number; else return { error: "Invalid example track" }; }
  if (b.published !== undefined) data.published = b.published === true;
  return { data };
}
