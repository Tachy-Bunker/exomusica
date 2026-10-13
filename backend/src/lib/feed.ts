export interface FeedItem { id: string; title: string; url: string; summary?: string; date: Date; author?: string; image?: string | null }
export interface Feed { title: string; subtitle?: string; url: string; selfUrl: string; items: FeedItem[] }

/** XML-safe text: escapes the five specials and drops characters XML 1.0 forbids. */
export const xmlEscape = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** First words of some markdown as plain text, for a feed summary. */
export function plainSummary(md: string | null | undefined, max = 240): string {
  const t = (md ?? "").replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~|-]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function toAtom(f: Feed): string {
  const updated = f.items.reduce((m, i) => (i.date > m ? i.date : m), new Date(0));
  const entries = f.items.map((i) => `  <entry>
    <id>${xmlEscape(i.id)}</id>
    <title>${xmlEscape(i.title)}</title>
    <link href="${xmlEscape(i.url)}"/>
    <updated>${i.date.toISOString()}</updated>${i.author ? `\n    <author><name>${xmlEscape(i.author)}</name></author>` : ""}${i.summary ? `\n    <summary>${xmlEscape(i.summary)}</summary>` : ""}${i.image ? `\n    <link rel="enclosure" href="${xmlEscape(i.image)}"/>` : ""}
  </entry>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xmlEscape(f.url)}</id>
  <title>${xmlEscape(f.title)}</title>${f.subtitle ? `\n  <subtitle>${xmlEscape(f.subtitle)}</subtitle>` : ""}
  <link href="${xmlEscape(f.url)}"/>
  <link rel="self" href="${xmlEscape(f.selfUrl)}"/>
  <updated>${(f.items.length ? updated : new Date()).toISOString()}</updated>
${entries}
</feed>
`;
}

/** JSON Feed 1.1 - the same items for people who would rather read JSON than XML. */
export function toJsonFeed(f: Feed): object {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: f.title,
    ...(f.subtitle ? { description: f.subtitle } : {}),
    home_page_url: f.url,
    feed_url: f.selfUrl,
    items: f.items.map((i) => ({ id: i.id, url: i.url, title: i.title, date_published: i.date.toISOString(), ...(i.summary ? { summary: i.summary } : {}), ...(i.author ? { authors: [{ name: i.author }] } : {}), ...(i.image ? { image: i.image } : {}) })),
  };
}

/** Newest first, capped. */
export const newestFirst = (items: FeedItem[], cap = 50): FeedItem[] => [...items].sort((a, b) => +b.date - +a.date).slice(0, cap);

/** Absolute address for a path or upload: PUBLIC_URL when set, otherwise what the request came in on. */
export function absolute(base: string, p: string | null | undefined): string | null {
  if (!p) return null;
  return /^https?:\/\//.test(p) ? p : base.replace(/\/$/, "") + (p.startsWith("/") ? p : "/" + p);
}
