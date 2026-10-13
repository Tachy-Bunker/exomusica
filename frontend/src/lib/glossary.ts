import { useEffect, useState } from "react";
import { api } from "./api";

export interface GlossaryEntry { id: number; term: string; aliases: string[]; definition: string }
export interface GlossaryData { terms: GlossaryEntry[]; pageSlug: string | null }

/** Matching state for one document: one pattern for every term, and which entries already got their link (only the first mention of each is linked). */
export interface GlossaryIndex { re: RegExp; byWord: Map<string, GlossaryEntry>; pageSlug: string | null; used: Set<number> }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildGlossary(data: GlossaryData | null): GlossaryIndex | null {
  if (!data || !Array.isArray(data.terms) || data.terms.length === 0) return null;
  const byWord = new Map<string, GlossaryEntry>();
  for (const t of data.terms) for (const w of [t.term, ...t.aliases]) if (!byWord.has(w.toLowerCase())) byWord.set(w.toLowerCase(), t);
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length); // longest first, so "beating tones" wins over "beating"
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return { re, byWord, pageSlug: data.pageSlug, used: new Set() };
}

/** Splits text into plain pieces and the first mention of each term. */
export function splitTerms(text: string, g: GlossaryIndex): (string | { word: string; entry: GlossaryEntry })[] {
  const out: (string | { word: string; entry: GlossaryEntry })[] = [];
  let last = 0;
  g.re.lastIndex = 0;
  for (const m of text.matchAll(g.re)) {
    const entry = g.byWord.get(m[1].toLowerCase());
    if (!entry || g.used.has(entry.id) || m.index === undefined) continue;
    g.used.add(entry.id);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ word: m[1], entry });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

let cache: Promise<GlossaryData> | null = null;
/** One request per page load, shared by every article on the page. */
export const loadGlossary = (): Promise<GlossaryData> => (cache ??= api<GlossaryData>("/api/glossary").catch(() => { cache = null; return { terms: [], pageSlug: null }; }));
export const resetGlossaryCache = () => { cache = null; };

export function useGlossaryData(): GlossaryData | null {
  const [d, setD] = useState<GlossaryData | null>(null);
  useEffect(() => { let live = true; void loadGlossary().then((x) => live && setD(x)); return () => { live = false; }; }, []);
  return d;
}
