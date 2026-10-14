/** A picture given as a link instead of a file. Pure, so it is tested without a server. */
export type CoverLink = { ok: true; url: string | null } | { ok: false; error: string };
const MAX = 500;

/** Empty clears the cover. Otherwise: a web address (http or https) or one of this site's own uploads, no spaces, at most 500 characters. */
export function parseCoverLink(raw: unknown): CoverLink {
  if (raw === null || raw === undefined) return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, error: "The cover link must be text" };
  const s = raw.trim();
  if (s === "") return { ok: true, url: null };
  if (s.length > MAX) return { ok: false, error: `The link is too long (at most ${MAX} characters)` };
  if (/\s/.test(s)) return { ok: false, error: "The link can't contain spaces" };
  if (/^\/uploads\/[^\s]+$/.test(s) && !s.includes("..")) return { ok: true, url: s };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: "That doesn't look like a link. Paste the full address, starting with https://" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Only http and https links can be used" };
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return { ok: false, error: "That doesn't look like a link. Paste the full address, starting with https://" };
  if (u.username || u.password) return { ok: false, error: "Links with a username or password aren't allowed" };
  return { ok: true, url: u.toString() };
}
