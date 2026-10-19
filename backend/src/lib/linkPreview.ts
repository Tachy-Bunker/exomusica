// The title, text, site and picture of a page, from its Open Graph and basic tags (fix412). Pure: the page is passed in as text.
export interface Preview { title: string; description: string; siteName: string; image: string | null; canonical: string | null }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** The attributes of one tag, lower cased names. */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

const cut = (s: string, n: number): string => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Reads the head of a page. The first value wins for each field, and og: beats twitter: beats plain tags. */
export function parsePreview(html: string, baseUrl: string): Preview {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const k = (a.property ?? a.name ?? "").toLowerCase();
    if (k && a.content !== undefined && !(k in meta)) meta[k] = a.content;
  }
  let canonical: string | null = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    if ((a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") && a.href) { canonical = a.href; break; }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const pick = (...keys: string[]): string => { for (const k of keys) if (meta[k]) return meta[k]; return ""; };
  const title = cut(pick("og:title", "twitter:title") || (titleTag ? decodeEntities(titleTag[1]) : ""), 200);
  const description = cut(pick("og:description", "twitter:description", "description"), 1000);
  const siteName = cut(pick("og:site_name"), 80);
  const rawImage = pick("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src");
  const absolute = (u: string | null): string | null => { if (!u) return null; try { const x = new URL(u, baseUrl); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch { return null; } };
  return { title, description, siteName, image: absolute(rawImage || null), canonical: absolute(canonical) };
}
