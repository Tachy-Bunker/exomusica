// The SEO tool's helpers: what a link to a page will say, and suggestions made from the page's own text. Pure.

export const TITLE_GOOD = 60;
export const DESCRIPTION_GOOD = 160;

/** The pictures named in a text, in order, without repeats. */
export function imagesIn(markdown: string, max = 12): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)) {
    if (/^(\/uploads\/|https?:\/\/)/i.test(m[1]) && !out.includes(m[1])) out.push(m[1]);
    if (out.length >= max) break;
  }
  return out;
}

/** Plain words from a text: no markup, no embedded blocks, cut at a word. */
export function plainText(markdown: string, max: number): string {
  let s = markdown
    .replace(/@(audio|video|file)\([^)]*\)(\[[^\]]*\])?/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/:::\w*/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_~`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) {
    s = s.slice(0, max);
    const cut = s.lastIndexOf(" ");
    s = `${(cut > max * 0.6 ? s.slice(0, cut) : s).replace(/[,;:\-–\s]+$/, "")}…`;
  }
  return s;
}

export interface SeoValue { ogTitle?: string | null; ogDescription?: string | null; ogImageUrl?: string | null }

/** Suggestions for the fields that are still blank. */
export function suggestSeo(page: { title: string; body: string }, current: SeoValue): SeoValue {
  return {
    ogTitle: current.ogTitle?.trim() ? current.ogTitle : page.title.slice(0, 90),
    ogDescription: current.ogDescription?.trim() ? current.ogDescription : plainText(page.body, DESCRIPTION_GOOD),
    ogImageUrl: current.ogImageUrl?.trim() ? current.ogImageUrl : (imagesIn(page.body, 1)[0] ?? null),
  };
}

export type Verdict = "empty" | "short" | "good" | "long";
export function lengthVerdict(text: string, good: number, min = 1): Verdict {
  const n = text.trim().length;
  return n === 0 ? "empty" : n < min ? "short" : n > good ? "long" : "good";
}
