import { useEffect } from "react";

export interface FontInfo {
  familyName: string;
  fileUrl: string;
  format: string;
}

const injectedFamilies = new Set<string>();

/** Ensures the @font-face rule for this font exists in the document, then
 *  returns the font-family value to apply. Pass null/undefined for "use
 *  the site default" — every call site already does this uniformly. */
export function useCustomFont(font: FontInfo | null | undefined): string | undefined {
  useEffect(() => {
    if (!font || injectedFamilies.has(font.familyName)) return;
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.familyName}"; src: url("${font.fileUrl}") format("${font.format}"); font-display: swap; }`;
    document.head.appendChild(style);
    injectedFamilies.add(font.familyName);
  }, [font]);

  return font ? `"${font.familyName}", var(--font-body)` : undefined;
}
