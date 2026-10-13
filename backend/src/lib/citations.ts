// Citations in study notes: the first link in a note is its source. Two notes cite the same source when the links are the same page.

const URL_RE = /https?:\/\/[^\s<>()\]]+/i;
const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i;

export function firstUrl(text: string): string | null {
  const m = URL_RE.exec(text);
  return m ? m[0].replace(/[.,;:!?'"]+$/, "") : null;
}

/** One form for one page: host in lower case, no www, no #fragment, no tracking parameters, no trailing slash. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = keep.length ? "?" + keep.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const pathname = u.pathname.replace(/\/+$/, "");
    return `${host}${pathname}${query}`;
  } catch {
    return null;
  }
}

export const sameSource = (a: string, b: string): boolean => {
  const x = normalizeUrl(a), y = normalizeUrl(b);
  return x !== null && x === y;
};
