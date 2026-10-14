import { useEffect } from "react";
import { create } from "zustand";
import { getJson } from "./sharedGet";
import { identityOf } from "./branchIdentity";
import { lift } from "./legibleColor";
import type { Branch } from "./types";

interface Theme { slug: string; name: string; color: string; glyph: string }
export const useHeaderThemeStore = create<{ theme: Theme | null; set: (t: Theme | null) => void }>((set) => ({ theme: null, set: (theme) => set({ theme }) }));

const cache = new Map<string, Promise<Theme | null>>();
export function themeOf(slug: string): Promise<Theme | null> {
  let p = cache.get(slug);
  if (!p) {
    p = getJson<Branch>(`/api/branches/${slug}`).then((b) => {
      if (!b || !b.slug) return null;
      const id = identityOf({ slug: b.slug, color: b.identityColor, glyph: b.identityGlyph, seed: (b as { visibility?: string }).visibility === "BABY_CRYSTALS" });
      return { slug: b.slug, name: b.name, color: lift(id.color), glyph: id.glyph };
    }).catch(() => { cache.delete(slug); return null; });
    cache.set(slug, p);
  }
  return p;
}

/** While a page about a branch is open, the top bar wears that branch's colour. Leaving the page puts the site look back. */
export function useHeaderTheme(slug: string | null | undefined): void {
  useEffect(() => {
    if (!slug) return;
    let live = true;
    void themeOf(slug).then((t) => { if (live && t) useHeaderThemeStore.getState().set(t); });
    return () => { live = false; useHeaderThemeStore.getState().set(null); };
  }, [slug]);
}
